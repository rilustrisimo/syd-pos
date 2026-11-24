/*
 * Shared runtime for animated reel templates (see src/lib/marketing/reel-styles.ts).
 *
 * A style file defines window.STYLE = { roles: { hook, product, proof, cta }, transition }
 * where each role builder receives (scene, ctx) and returns a <section>.
 * window.REEL (the ReelData) is injected by the renderer or the preview page.
 *
 * Every CSS animation is paused and positioned by seek(t), so a frame at
 * time t always looks the same: the renderer screenshots frame by frame and
 * the preview drives seek() from the narration's currentTime.
 */
(function () {
  const params = new URLSearchParams(location.search)

  // Sample data so a template can be opened directly while designing it.
  const SAMPLE = {
    durationSeconds: 14.8, leadSeconds: 0.4,
    scenes: [
      { role: 'hook', start: 0, end: 2.23, headline: 'Magpapatayo ka ba?', spoken: '' },
      { role: 'product', start: 2.23, end: 4.9, headline: 'Semento?', stamp: 'Matibay!', spoken: '' },
      { role: 'proof', start: 4.9, end: 10.53, headline: 'Ready stock', sub: 'SYD Construction Supplies', items: ['By the bag', 'Bulk'], spoken: '' },
      { role: 'cta', start: 10.53, end: 14.8, headline: 'Order online', stamp: 'Order na!', spoken: '' },
    ],
    product: { name: 'Cement 40kg', imageUrl: null },
    cta: { site: 'sydconstruct.com', phone: '+63 945 801 3640' },
    logoUrl: '../syd-logo.svg',
  }

  function readData() {
    if (window.REEL) return window.REEL
    if (params.get('data')) {
      // A raw "+" in the query string arrives as a space — put it back before decoding.
      const b64 = params.get('data').replace(/ /g, '+')
      try { return JSON.parse(decodeURIComponent(escape(atob(b64)))) } catch (e) { console.error(e) }
    }
    return SAMPLE
  }

  /** Creates an element with classes and optional text. */
  function el(tag, className, text) {
    const n = document.createElement(tag)
    if (className) n.className = className
    if (text != null) n.textContent = text
    return n
  }

  /**
   * Adds timed animations to a node: list of [name, durationSec, atSec, easing?, iterations?].
   * atSec is absolute video time.
   */
  function animate(node, list) {
    const parts = (Array.isArray(list[0]) ? list : [list]).map(([name, dur, at, ease, iter]) =>
      `${name} ${dur}s ${ease || 'cubic-bezier(.2,.8,.2,1)'} ${Math.max(0, at).toFixed(3)}s ${iter || 1} both`)
    node.style.animation = parts.join(', ')
    return node
  }

  /** Shrinks font-size until the node fits w × h (px). */
  function fit(node, { w, h, max, min = 40 }) {
    node.style.width = w + 'px'
    let size = max
    node.style.fontSize = size + 'px'
    while (size > min && (node.scrollWidth > w + 1 || (h && node.scrollHeight > h + 1))) {
      size -= 4
      node.style.fontSize = size + 'px'
    }
    return size
  }

  function build(data) {
    const stage = document.getElementById('stage')
    const style = window.STYLE
    data.scenes.forEach((scene, index) => {
      const dur = Math.max(0.5, scene.end - scene.start)
      const pendingFits = []
      const ctx = {
        index,
        last: index === data.scenes.length - 1,
        data,
        el, animate,
        // Measured after the scene is on the page (detached nodes have no size).
        fit: (node, opts) => pendingFits.push([node, opts]),
        /** Absolute time at a fraction of this scene (0–1), or seconds after its start if > 1. */
        at: (f) => scene.start + (f <= 1 ? f * dur : f),
        dur,
      }
      const builder = style.roles[scene.role] || style.roles.proof
      const section = builder(scene, ctx)
      section.classList.add('scene')
      section.style.zIndex = String(index + 1)
      if (index > 0 && style.transition) animate(section, [style.transition, 0.35, scene.start - 0.12, 'cubic-bezier(.7,0,.3,1)'])
      stage.appendChild(section)
      // Animations that start scaled or off-screen inflate scrollWidth, so
      // measure with animations switched off.
      document.documentElement.classList.add('measuring')
      pendingFits.forEach(([node, opts]) => fit(node, opts))
      document.documentElement.classList.remove('measuring')
      if (style.afterBuild) style.afterBuild(section, scene, ctx)
    })
  }

  const data = readData()
  window.REEL_DATA = data

  window.seek = function (t) {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000 }
  }

  // Preview: drive the timeline from the narration's clock.
  window.play = function (audio) {
    let raf
    const lead = data.leadSeconds || 0
    const start = performance.now()
    const tick = () => {
      const t = audio && !audio.paused ? audio.currentTime + lead : (performance.now() - start) / 1000
      window.seek(Math.min(t, data.durationSeconds))
      if (t < data.durationSeconds) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }

  // Load the style's fonts before measuring text: document.fonts.ready alone
  // resolves before a font is ever requested, so text would be fitted with
  // the fallback font. STYLE.fonts = ['Anton', '800 Inter', ...].
  const fontLoads = (window.STYLE.fonts || []).map((f) => {
    const m = f.match(/^(\d{3})\s+(.+)$/)
    return document.fonts.load(`${m ? m[1] : '400'} 100px "${m ? m[2] : f}"`).catch(() => {})
  })

  window.ready = Promise.all(fontLoads)
    .then(() => document.fonts.ready)
    .then(() => { build(data) })
    .then(() => Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => {})))))
    .then(() => document.fonts.ready)
    .then(() => { window.seek(0); document.documentElement.dataset.ready = '1' })
})()
