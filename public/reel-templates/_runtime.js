/*
 * Shared runtime for animated reel templates (see src/lib/marketing/reel-styles.ts).
 *
 * A style file defines window.STYLE = { roles: { hook, problem, solution, product, proof, cta }, transition, cast: { enter } }
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
    product: { name: 'Cement 40kg', imageUrl: null, prop: 'cement_bag' },
    cta: { site: 'sydconstruct.com', phone: '+63 945 801 3640' },
    logoUrl: '../syd-logo.svg',
  }

  // ?sample=story — a problem → fix story with the cast and props.
  const STORY_SAMPLE = {
    durationSeconds: 16, leadSeconds: 0.4,
    scenes: [
      { role: 'hook', start: 0, end: 2.6, headline: 'Nakatakas ang baboy!', character: { cast: 'ramon', pose: 'worried', mood: 'surprised' }, props: ['pig', 'fence'], spoken: '' },
      { role: 'problem', start: 2.6, end: 6.2, headline: 'Bulok na kahoy', sub: 'Inanay ang bakod', character: { cast: 'ramon', pose: 'think', mood: 'worried' }, props: ['fence', 'crack'], spoken: '' },
      { role: 'solution', start: 6.2, end: 10.4, headline: 'Cyclone wire + G.I. tubes', stamp: 'Sulit!', character: { cast: 'lyn', pose: 'point', mood: 'happy' }, props: ['cyclone_wire', 'gi_pipe'], spoken: '' },
      { role: 'proof', start: 10.4, end: 13.2, headline: 'Hindi na kakalawangin', items: ['Galvanized', 'Matagal gamitin'], character: { cast: 'ramon', pose: 'thumbs_up', mood: 'happy' }, spoken: '' },
      { role: 'cta', start: 13.2, end: 16, headline: 'Order na sa SYD', character: { cast: 'lyn', pose: 'phone' }, spoken: '' },
    ],
    product: { name: 'Cyclone Wire 6ft', imageUrl: null, prop: 'cyclone_wire' },
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
    return params.get('sample') === 'story' ? STORY_SAMPLE : SAMPLE
  }

  // Characters (_cast.js) and props (_props.js), shared by every style.
  const castCss = document.createElement('style')
  castCss.textContent = `
    @keyframes castDraw { from { stroke-dashoffset:1.02; } to { stroke-dashoffset:0; } }
    @keyframes castPop { 0% { opacity:0; transform:scale(.2); } 70% { opacity:1; transform:scale(1.08); } 100% { opacity:1; transform:none; } }
    @keyframes castSlideL { from { opacity:0; transform:translateX(-420px); } to { opacity:1; transform:none; } }
    @keyframes castRise { from { transform:translateY(700px); } 70% { transform:translateY(-30px); } to { transform:none; } }
    @keyframes castSwapA { 0%,49.9% { opacity:1; } 50%,100% { opacity:0; } }
    @keyframes castSwapB { 0%,49.9% { opacity:0; } 50%,100% { opacity:1; } }
    @keyframes castSlideR { from { opacity:0; transform:translateX(420px); } to { opacity:1; transform:none; } }
    @keyframes castFillIn { from { fill-opacity:0; } to { fill-opacity:1; } }
    @keyframes castFade { from { opacity:0; } to { opacity:1; } }
    @keyframes castFlicker { 0% { opacity:0; } 10% { opacity:1; } 16% { opacity:.15; } 26% { opacity:1; } 32% { opacity:.3; } 42%,100% { opacity:1; } }
    @keyframes castBob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-12px); } }
    @keyframes castWave { 0%,100% { transform:rotate(0); } 50% { transform:rotate(-7deg); } }
    @keyframes castShake { 0%,100% { transform:translateX(0); } 25% { transform:translateX(-7px); } 75% { transform:translateX(7px); } }
    @keyframes castFloat { 0%,100% { transform:translateY(0) rotate(-3deg); } 50% { transform:translateY(-10px) rotate(3deg); } }
    .castbox { position:absolute; pointer-events:none; }
    .castbox .ci { position:absolute; }
    .castbox svg { display:block; width:100%; height:100%; overflow:visible; }
    .castbox svg.alt { position:absolute; inset:0; }
    .castbox .fig { stroke-width:var(--fig-stroke, 11); }
    .castbox .prop { stroke-width:var(--prop-stroke, 5); }
    .castbox .f-head { fill:var(--fig-fill, none); }
    .castbox .f-acc { fill:var(--fig-accent, none); }
    .castbox .f-hat { fill:var(--hat-fill, var(--cast-color)); }
    .castbox .eye { fill:currentColor; stroke:none; }
    .castbox .fig-logo { font:800 24px Inter, Arial, sans-serif; fill:var(--fig-logo, #fff); stroke:none; }
    .castbox .fig-arms, .castbox .fig-mark { transform-box:view-box; transform-origin:150px 140px; }
    .castbox .fig-mark { transform-origin:250px 50px; }
    .castbox.draw .d { stroke-dasharray:1 2; }
  `
  document.head.appendChild(castCss)

  /**
   * Places the scene's character and props in box {left, top, w, h}.
   * opts: { at, enter ('pop'|'slide'|'fade'|'flicker'|'draw'), flip, character, props, onlyProps }
   * Returns the .castbox element (or null) with .draws = [{node, at, dur}] for
   * every stroke drawn on, and .endsAt.
   */
  // Second key pose for limited animation.
  const ALT_POSE = { stand: 'walk', walk: 'stand', point: 'stand', think: 'stand', worried: 'shrug', happy: 'thumbs_up', carry: 'walk', shrug: 'worried', thumbs_up: 'happy', phone: 'think' }

  function castBlock(scene, box, opts, ctx) {
    const character = opts.character !== undefined ? opts.character : scene.character
    const propIds = (opts.props !== undefined ? opts.props : scene.props || []).filter((p) => window.drawProp && window.drawProp(p)).slice(0, 3)
    const hasFig = !!(character && window.drawFigure)
    if (!hasFig && !propIds.length) return null
    const cfg = window.STYLE.cast || {}
    const enter = opts.enter || cfg.enter || 'pop'
    const at = opts.at
    // Alternate sides scene by scene so consecutive scenes don't look alike.
    const figRight = opts.flip != null ? opts.flip : ctx.index % 2 === 1
    const wrap = el('div', 'castbox' + (enter === 'draw' ? ' draw' : ''))
    Object.assign(wrap.style, { left: box.left + 'px', top: box.top + 'px', width: box.w + 'px', height: box.h + 'px' })
    const items = []
    const FIG_RATIO = 300 / 440
    const n = propIds.length
    if (hasFig) {
      let fh = box.h, fw = fh * FIG_RATIO
      const maxW = n ? box.w * 0.5 : box.w
      if (fw > maxW) { fw = maxW; fh = fw / FIG_RATIO }
      const left = n ? (figRight ? box.w - fw : 0) : (box.w - fw) / 2
      const look = { cast: character.cast, mood: character.mood, flip: figRight && n > 0, rods: !!cfg.rods }
      const svg = window.drawFigure({ ...look, pose: character.pose })
      // Limited animation: hold two key poses and snap between them.
      const alt = cfg.altPose ? window.drawFigure({ ...look, pose: ALT_POSE[character.pose] || 'stand' }) : null
      if (alt) alt.classList.add('alt')
      items.push({ svg, alt, kind: 'fig', left, top: box.h - fh, w: fw, h: fh })
    }
    if (n) {
      const areaL = hasFig ? (figRight ? 0 : box.w * 0.5) : 0
      const areaW = hasFig ? box.w * 0.5 : box.w
      const wide = areaW > box.h * 1.3
      const size = Math.min(wide ? areaW / n * 0.86 : areaW * 0.86, wide ? box.h * 0.8 : (box.h / n) * 0.92, !hasFig && n === 1 ? 560 : 340)
      propIds.forEach((id, i) => {
        let left, top
        if (wide) { left = areaL + (areaW / n) * (i + 0.5) - size / 2; top = (box.h - size) / 2 + (i % 2 ? size * 0.12 : -size * 0.06) }
        else { left = areaL + (areaW - size) / 2 + (n > 1 ? (i % 2 ? 1 : -1) * Math.min(40, areaW * 0.06) : 0); top = (box.h - n * size) / 2 + i * size }
        items.push({ svg: window.drawProp(id), kind: 'prop', left, top, w: size, h: size })
      })
    }
    const draws = []
    let t = at
    // Drawing on: fit every stroke inside the scene (figure ~1s, props ~0.55s each by default).
    const drawTotal = items.reduce((a, it) => a + (it.kind === 'fig' ? 1.0 : 0.55), 0)
    const drawScale = Math.min(1, Math.max(0.25, ((ctx.at(1) - at) * 0.8) / Math.max(0.1, drawTotal)))
    items.forEach((it, i) => {
      const holder = el('div', 'ci')
      Object.assign(holder.style, { left: it.left + 'px', top: it.top + 'px', width: it.w + 'px', height: it.h + 'px' })
      holder.append(it.svg)
      if (it.alt) holder.append(it.alt)
      wrap.append(holder)
      const start = at + i * 0.18
      if (enter === 'draw') {
        // Head first (it sits on top in the SVG so raised arms tuck behind it).
        const paths = [...it.svg.querySelectorAll('.fig-head .d'), ...it.svg.querySelectorAll('.d:not(.fig-head .d)')]
        const total = (it.kind === 'fig' ? 1.0 : 0.55) * drawScale
        const each = total / Math.max(1, paths.length)
        const s0 = i === 0 ? start : t
        paths.forEach((p, k) => {
          p.setAttribute('pathLength', '1')
          animate(p, ['castDraw', each, s0 + k * each, 'ease-in-out'])
          draws.push({ node: p, at: s0 + k * each, dur: each })
        })
        // Fills and eyes appear once the outline is drawn.
        it.svg.querySelectorAll('.f-acc, .f-hat, .f-head, circle:not(.d), text').forEach((f) => {
          const fadeIn = `${f.classList.contains('d') ? 'castFillIn' : 'castFade'} .3s ease-out ${(s0 + total).toFixed(3)}s 1 both`
          f.style.animation = f.style.animation ? `${f.style.animation}, ${fadeIn}` : fadeIn
        })
        t = s0 + total
      } else {
        const name = enter === 'slide' ? (it.kind === 'fig' ? (figRight ? 'castSlideR' : 'castSlideL') : 'castPop')
          : enter === 'rise' ? 'castRise' : enter === 'flicker' ? 'castFlicker' : enter === 'fade' ? 'castFade' : 'castPop'
        animate(holder, [name, enter === 'flicker' ? 0.8 : enter === 'rise' ? 0.7 : 0.5, start, enter === 'pop' ? 'cubic-bezier(.3,1.3,.5,1)' : 'cubic-bezier(.2,.8,.2,1)'])
        t = Math.max(t, start + 0.5)
      }
      // Idle life after the entrance.
      const idleAt = (enter === 'draw' ? t : start + 0.55)
      if (it.kind === 'fig') {
        const pose = character.pose, mood = character.mood
        if (it.alt) {
          animate(it.svg, ['castSwapA', 1.1, idleAt, 'linear', 'infinite'])
          animate(it.alt, ['castSwapB', 1.1, idleAt, 'linear', 'infinite'])
          return
        }
        if (mood === 'worried' || pose === 'worried') animate(it.svg, ['castShake', 0.5, idleAt, 'ease-in-out', 'infinite'])
        else animate(it.svg, ['castBob', 1.6, idleAt, 'ease-in-out', 'infinite'])
        const arms = it.svg.querySelector('.fig-arms')
        if (arms && /happy|point|thumbs_up|shrug/.test(pose)) animate(arms, ['castWave', 0.9, idleAt, 'ease-in-out', 'infinite'])
        const mark = it.svg.querySelector('.fig-mark')
        if (mark && enter !== 'draw') animate(mark, ['castPop', 0.4, idleAt + 0.1, 'ease-out'])
      } else if (enter !== 'draw') {
        animate(it.svg, ['castFloat', 2.2 + i * 0.3, idleAt, 'ease-in-out', 'infinite'])
      }
    })
    wrap.draws = draws
    wrap.endsAt = t
    return wrap
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
        /** Character + props for this scene in a box; see castBlock. */
        cast: (sc, box, opts = {}) => castBlock(sc, box, { at: ctx.at(0.15), ...opts }, ctx),
        hasCast: (sc) => !!(sc.character || (sc.props && sc.props.length)),
        /** The product's prop (or a plain crate) for a product scene without a photo. */
        productProp: () => (data.product && data.product.prop) || 'crate',
      }
      const fallback = { problem: 'hook', solution: 'product' }[scene.role]
      const builder = style.roles[scene.role] || style.roles[fallback] || style.roles.proof
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
    // Optional one-off work after layout (e.g. pixel styles rasterise the cast once).
    .then(() => (window.STYLE.prepare ? window.STYLE.prepare() : null))
    .then(() => { window.seek(0); document.documentElement.dataset.ready = '1' })
})()
