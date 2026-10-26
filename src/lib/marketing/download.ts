// Saves a library file (R2 or Supabase Storage public URL) to the user's
// device under its original name. A plain <a download> is ignored for
// cross-origin URLs (the browser just opens the file), so the file is
// fetched as a blob first. The distinct ?download=1 query avoids reusing a
// thumbnail Chrome cached without CORS headers (R2 doesn't send
// Vary: Origin — same issue as the reel player).

export async function downloadMediaFile(url: string, filename: string): Promise<void> {
  const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}download=1`
  try {
    const res = await fetch(fetchUrl, { mode: 'cors' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
  } catch {
    // Fallback: open it in a new tab, where it can be saved manually.
    window.open(url, '_blank', 'noopener')
  }
}
