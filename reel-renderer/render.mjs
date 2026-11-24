#!/usr/bin/env node
// Renders an animated reel (public/reel-templates/<style>.html) to MP4:
// headless Chrome steps through every frame (seek(t) → screenshot), then
// FFmpeg encodes H.264 + the narration (AAC, loudness-normalised).
//
//   node render.mjs --local <reel.json> <narration.(wav|mp3)> <out.mp4>
//   node render.mjs <job_id>        ← GitHub Actions (.github/workflows/render-reel.yml)
//
// Job mode reads reel_render_jobs with the Supabase service-role key, uploads
// the MP4 to R2, creates the content_media row and attaches it to the post.
// Optional env: CHROME_PATH (local Chrome build), FFMPEG_PATH (default "ffmpeg").

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES = path.resolve(HERE, '../public/reel-templates')
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FPS = 30

export async function renderReel({ reel, audioPath, outPath, onProgress = () => {} }) {
  const template = path.join(TEMPLATES, `${reel.style}.html`)
  if (!fs.existsSync(template)) throw new Error(`Unknown style: ${reel.style}`)
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'))
  const frames = path.join(work, 'frames')
  fs.mkdirSync(frames)

  // Frames are independent (seek(t) positions every animation exactly), so
  // several tabs can each capture a slice of the timeline in parallel.
  const workers = Math.max(1, Math.min(Number(process.env.REEL_WORKERS) || os.cpus().length, 4))
  const total = Math.ceil(reel.durationSeconds * FPS)
  const t0 = Date.now()
  let done = 0
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  try {
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
      const pageErrors = []
      page.on('pageerror', (e) => pageErrors.push(e.message))
      await page.addInitScript((r) => { window.REEL = r }, reel)
      await page.goto('file://' + template)
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 })
      if (pageErrors.length) throw new Error('Template error: ' + pageErrors[0])
      // Chrome's fast capture path (Playwright's screenshot() doesn't expose optimizeForSpeed).
      const cdp = await page.context().newCDPSession(page)
      const from = Math.floor((total * w) / workers), to = Math.floor((total * (w + 1)) / workers)
      for (let f = from; f < to; f++) {
        await page.evaluate((t) => window.seek(t), f / FPS)
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true })
        fs.writeFileSync(path.join(frames, String(f).padStart(5, '0') + '.jpg'), Buffer.from(data, 'base64'))
        if (++done % 60 === 0) onProgress(done, total)
      }
      await page.close()
    }))
  } finally {
    await browser.close()
  }
  const captureSec = (Date.now() - t0) / 1000
  const t1 = Date.now()

  const delayMs = Math.round((reel.leadSeconds || 0) * 1000)
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'),
    '-i', audioPath,
    '-filter_complex', `[1:a]adelay=${delayMs}|${delayMs},apad,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-t', String(reel.durationSeconds), '-movflags', '+faststart', outPath])
  fs.rmSync(work, { recursive: true, force: true })
  console.log(`${total} frames · ${workers} tab(s) · capture ${captureSec.toFixed(1)}s · encode ${((Date.now() - t1) / 1000).toFixed(1)}s`)
  return { bytes: fs.statSync(outPath).size }
}

// ── Job mode (GitHub Actions) ───────────────────────────────────────────────
async function runJob(jobId) {
  const { createClient } = await import('@supabase/supabase-js')
  const { AwsClient } = await import('aws4fetch')
  const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`Missing env ${k}`); return v }
  const supabase = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

  const { data: job, error } = await supabase.from('reel_render_jobs').select('*').eq('id', jobId).single()
  if (error || !job) throw new Error(`Job ${jobId} not found: ${error?.message}`)
  if (job.status === 'done') { console.log('Job already done'); return }

  const update = (fields) => supabase.from('reel_render_jobs').update(fields).eq('id', jobId)
  await update({ status: 'rendering', started_at: new Date().toISOString(), error: null, github_run_url: process.env.GITHUB_RUN_URL || null })

  try {
    const publicBase = need('R2_PUBLIC_URL').replace(/\/$/, '')
    const audioRes = await fetch(`${publicBase}/${job.voice_storage_key}`)
    if (!audioRes.ok) throw new Error(`Could not download the narration (HTTP ${audioRes.status})`)
    const ext = path.extname(job.voice_storage_key) || '.mp3'
    const audioPath = path.join(os.tmpdir(), `narration-${jobId}${ext}`)
    fs.writeFileSync(audioPath, Buffer.from(await audioRes.arrayBuffer()))

    const outPath = path.join(os.tmpdir(), `reel-${jobId}.mp4`)
    await renderReel({ reel: job.reel_data, audioPath, outPath, onProgress: (f, t) => console.log(`frame ${f}/${t}`) })
    const body = fs.readFileSync(outPath)

    const key = `reels/${crypto.randomUUID()}.mp4`
    const r2 = new AwsClient({ accessKeyId: need('CLOUDFLARE_R2_ACCESS_KEY_ID'), secretAccessKey: need('CLOUDFLARE_R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' })
    // R2_ENDPOINT only for local testing against a stand-in server.
    const endpoint = process.env.R2_ENDPOINT || `https://${need('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`
    const put = await r2.fetch(`${endpoint}/${need('CLOUDFLARE_R2_BUCKET')}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(body.byteLength) },
      body,
    })
    if (!put.ok) throw new Error(`Upload to R2 failed (HTTP ${put.status}): ${(await put.text()).slice(0, 200)}`)

    const { data: media, error: mediaErr } = await supabase.from('content_media').insert({
      media_type: 'video',
      storage_key: key,
      original_filename: `reel-${job.style}-${Date.now()}.mp4`,
      mime_type: 'video/mp4',
      size_bytes: body.byteLength,
      duration_seconds: job.reel_data.durationSeconds,
      uploaded_by: job.created_by,
    }).select('id').single()
    if (mediaErr) throw new Error(`Saving the video failed: ${mediaErr.message}`)

    const { error: attachErr } = await supabase.from('content_suggestions')
      .update({ creative_media_id: media.id }).eq('id', job.suggestion_id)
    if (attachErr) throw new Error(`Attaching the video failed: ${attachErr.message}`)

    await update({ status: 'done', output_media_id: media.id, finished_at: new Date().toISOString() })
    console.log(`Done: ${key} (${Math.round(body.byteLength / 1024)} KB)`)
  } catch (err) {
    await update({ status: 'failed', error: String(err.message || err).slice(0, 500), finished_at: new Date().toISOString() })
    throw err
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const [, , first, ...rest] = process.argv
if (first === '--local') {
  const [reelJson, audioPath, outPath] = rest
  const reel = JSON.parse(fs.readFileSync(reelJson, 'utf8'))
  const t0 = Date.now()
  renderReel({ reel, audioPath, outPath, onProgress: (f, t) => process.stdout.write(`frame ${f}/${t}\n`) })
    .then(({ bytes }) => console.log(`Rendered ${outPath} (${Math.round(bytes / 1024)} KB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`))
    .catch((e) => { console.error(e.message); process.exit(1) })
} else if (first) {
  runJob(first).catch((e) => { console.error(e.message); process.exit(1) })
} else {
  console.log('Usage: node render.mjs --local <reel.json> <narration> <out.mp4> | node render.mjs <job_id>')
  process.exit(1)
}
