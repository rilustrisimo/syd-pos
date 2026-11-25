/*
 * Shared scene builder for the "story" reel styles (Stick Figure Story,
 * Sketchnote, Silent Film, Paper Cut-out, …). A style file calls
 *
 *   storyStyle({ fonts, transition, cast, bg, overlay, enter, text, layout, … })
 *
 * which sets window.STYLE with all six roles (hook, problem, solution,
 * product, proof, cta) laid out on shared slots. A skin changes the look:
 *   bg(ctx, scene, role)        → node(s) behind everything
 *   overlay(ctx, scene, role)   → node(s) on top (grain, frames, stage front)
 *   enter[kind]                 → [keyframe, seconds, easing] per text kind
 *   text[kind](ctx, str, box, make) → custom text node (make = default maker)
 *   layout[role]                → slot overrides ({ head: { top, h, … }, cast: {…} })
 *   decorateCast(castbox, ctx, scene, role)
 *   roles[role](scene, ctx, H)  → replace a role entirely (H = helpers)
 * Text kinds: head, sub, stamp, item, bullet, label, site, phone, button.
 */
(function () {
  const css = document.createElement('style')
  css.textContent = `
    @keyframes stFade { from { opacity:0; } to { opacity:1; } }
    @keyframes stRise { from { opacity:0; transform:translateY(70px); } to { opacity:1; transform:none; } }
    @keyframes stPop { 0% { opacity:0; transform:scale(.3); } 70% { opacity:1; transform:scale(1.08); } 100% { opacity:1; transform:none; } }
    @keyframes stStamp { 0% { opacity:0; transform:scale(2.2) rotate(-8deg); } 60% { opacity:1; transform:scale(.94) rotate(-6deg); } 100% { opacity:1; transform:rotate(-6deg); } }
    @keyframes stType { from { clip-path:inset(-20% 100% -20% -2%); } to { clip-path:inset(-20% -2% -20% -2%); } }
    @keyframes stDrop { 0% { transform:translateY(-1400px) rotate(-6deg); } 70% { transform:translateY(24px) rotate(2deg); } 100% { transform:none; } }
    @keyframes stSlideL { from { opacity:0; transform:translateX(-500px); } to { opacity:1; transform:none; } }
    @keyframes stSlideR { from { opacity:0; transform:translateX(500px); } to { opacity:1; transform:none; } }
    @keyframes stWipe { from { clip-path:inset(0 0 0 100%); } to { clip-path:inset(0 0 0 0); } }
    @keyframes stIris { from { clip-path:circle(0% at 50% 45%); } to { clip-path:circle(120% at 50% 45%); } }
    @keyframes stCut { 0% { opacity:0; } 0.1%, 100% { opacity:1; } }
    @keyframes stPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
    .st .t { position:absolute; }
    .st .st-logo { position:absolute; display:block; }
  `
  document.head.appendChild(css)

  // Default slots (1080×1920; the bottom ~150px stays clear for app UI).
  const D = {
    hook: { head: { left: 80, top: 200, w: 920, h: 520, max: 200 }, sub: { left: 90, top: 760, w: 900, h: 110, max: 60 }, cast: { left: 90, top: 820, w: 900, bottom: 1760 } },
    problem: { head: { left: 80, top: 170, w: 920, h: 380, max: 180 }, sub: { left: 90, top: 590, w: 900, h: 100, max: 56 }, cast: { left: 90, top: 720, w: 900, bottom: 1760 }, stamp: { left: 290, top: 1600, w: 500, h: 150, max: 110 } },
    product: { head: { left: 80, top: 170, w: 920, h: 230, max: 150 }, visual: { left: 190, top: 440, w: 700, h: 640 }, label: { left: 120, top: 1110, w: 840, h: 120, max: 80 }, figure: { left: 50, top: 1300, w: 250, h: 400 }, stamp: { left: 330, top: 1300, w: 520, h: 150, max: 110 }, sub: { left: 90, top: 1580, w: 900, h: 140, max: 56 } },
    proof: { head: { left: 80, top: 170, w: 920, h: 400, max: 190 }, sub: { left: 90, top: 600, w: 900, h: 100, max: 54 }, stamp: { left: 560, top: 720, w: 440, h: 110, max: 80 }, items: { left: 80, top: 860, w: 920, h: 170, step: 230, max: 96 }, side: { left: 730, top: 160, w: 290, h: 440 }, cast: { left: 90, top: 820, w: 900, bottom: 1760 } },
    cta: { logo: { left: 290, top: 210, w: 500 }, head: { left: 80, top: 620, w: 920, h: 220, max: 170 }, site: { left: 90, top: 900, w: 900, h: 120, max: 96 }, phone: { left: 90, top: 1060, w: 900, h: 90, max: 60 }, button: { left: 240, top: 1230, w: 600, h: 160, max: 120 }, figure: { left: 60, top: 1440, w: 260, h: 330 } },
  }
  D.solution = D.problem

  window.storyStyle = function (S) {
    const lay = (role) => (S.layout && (S.layout[role] || (role === 'solution' && S.layout.problem))) || {}
    const slot = (role, key) => ({ ...(D[role][key] || {}), ...(lay(role)[key] || {}) })

    /** Default text maker: fitted, positioned, animated in. */
    function make(ctx, kind, text, box) {
      const n = ctx.el('div', `t t-${kind}`, text)
      Object.assign(n.style, { left: box.left + 'px', top: box.top + 'px', textAlign: box.align || (S.align && S.align[kind]) || (kind === 'head' ? S.headAlign : null) || 'left' })
      ctx.fit(n, { w: box.w, h: box.h, max: box.max, min: box.min || 28 })
      const e = (S.enter && (S.enter[kind] || S.enter.text)) || ['stFade', 0.5]
      ctx.animate(n, [e[0], e[1], box.at, e[2]])
      return n
    }
    function T(ctx, kind, text, box) {
      if (!text) return null
      return S.text && S.text[kind] ? S.text[kind](ctx, text, box, (b = box, k = kind, t = text) => make(ctx, k, t, b)) : make(ctx, kind, text, box)
    }
    function section(ctx, scene, role) {
      const s = ctx.el('section', `st st-${role}`)
      if (S.bg) s.append(...[].concat(S.bg(ctx, scene, role) || []).filter(Boolean))
      return s
    }
    function finish(s, ctx, scene, role) {
      if (S.overlay) s.append(...[].concat(S.overlay(ctx, scene, role) || []).filter(Boolean))
      return s
    }
    function cast(ctx, scene, role, box, opts = {}) {
      const c = ctx.cast(scene, { left: box.left, top: box.top, w: box.w, h: box.h != null ? box.h : box.bottom - box.top }, opts)
      if (c && S.decorateCast) S.decorateCast(c, ctx, scene, role)
      return c
    }
    const add = (s, ...nodes) => { nodes.forEach((n) => n && s.append(n)); return s }
    const castAt = (ctx, f) => ctx.at(S.castDelay != null ? Math.max(S.castDelay, f) : f)

    function storyRole(role) {
      return (scene, ctx) => {
        const { at, data } = ctx
        const s = section(ctx, scene, role)
        const head = slot(role, 'head'), sub = slot(role, 'sub'), stamp = slot(role, 'stamp')
        add(s, T(ctx, 'head', scene.headline, { ...head, at: at(0.05), role }))
        let top = slot(role, 'cast').top
        if (scene.sub) { add(s, T(ctx, 'sub', scene.sub, { ...sub, at: at(0.25), role })); top = Math.max(top, sub.top + sub.h + 30) }
        const c = slot(role, 'cast')
        // A stamp below the picture shortens it; one placed above (top > picture top) doesn't.
        const bottom = scene.stamp && role !== 'hook' && stamp.top > top ? Math.min(c.bottom, stamp.top - 20) : c.bottom
        let props
        if (role === 'solution' && !(scene.props && scene.props.length) && data.product.prop) props = [data.product.prop]
        if (role === 'hook' && !ctx.hasCast(scene)) props = ['house']
        add(s, cast(ctx, scene, role, { ...c, top, bottom }, { at: castAt(ctx, role === 'hook' ? 0.3 : 0.2), props }))
        if (scene.stamp && role !== 'hook') add(s, T(ctx, 'stamp', scene.stamp, { ...stamp, align: 'center', at: at(0.6), role }))
        return finish(s, ctx, scene, role)
      }
    }

    function product(scene, ctx) {
      const { at, data, el, animate } = ctx
      const role = 'product'
      const s = section(ctx, scene, role)
      add(s, T(ctx, 'head', scene.headline, { ...slot(role, 'head'), at: at(0.04), role }))
      const v = slot(role, 'visual')
      if (data.product.imageUrl) {
        const f = el('div', 'st-photo'); Object.assign(f.style, { position: 'absolute', left: v.left + 'px', top: v.top + 'px', width: v.w + 'px', height: v.h + 'px' })
        const img = el('img'); img.src = data.product.imageUrl; Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain', display: 'block' })
        const e = (S.enter && S.enter.photo) || ['stPop', 0.6]
        f.append(img); animate(f, [e[0], e[1], at(0.12), e[2]])
        add(s, f)
      } else {
        add(s, cast(ctx, scene, role, v, { at: castAt(ctx, 0.12), character: null, props: [ctx.productProp()] }))
        add(s, T(ctx, 'label', data.product.name, { ...slot(role, 'label'), align: 'center', at: at(0.4), role }))
      }
      const fig = slot(role, 'figure')
      if (scene.character) add(s, cast(ctx, scene, role, fig, { at: castAt(ctx, 0.45), props: [], flip: false }))
      if (scene.stamp) add(s, T(ctx, 'stamp', scene.stamp, { ...slot(role, 'stamp'), align: 'center', at: at(0.6), role }))
      const sub = slot(role, 'sub')
      if (scene.sub) add(s, T(ctx, 'sub', scene.sub, scene.character ? { ...sub, left: fig.left + fig.w + 30, w: sub.w - (fig.left + fig.w + 30 - sub.left), at: at(0.4), role } : { ...sub, at: at(0.4), role }))
      return finish(s, ctx, scene, role)
    }

    function proof(scene, ctx) {
      const { at } = ctx
      const role = 'proof'
      const s = section(ctx, scene, role)
      const items = (scene.items || []).slice(0, 3)
      const side = scene.character && items.length
      const head = slot(role, 'head'), sd = slot(role, 'side')
      add(s, T(ctx, 'head', scene.headline, { ...head, w: side ? sd.left - head.left - 20 : head.w, at: at(0.04), role }))
      if (scene.sub) add(s, T(ctx, 'sub', scene.sub, { ...slot(role, 'sub'), at: at(0.15), role }))
      if (scene.stamp) add(s, T(ctx, 'stamp', scene.stamp, { ...slot(role, 'stamp'), align: 'center', at: at(0.3), role }))
      if (side) add(s, cast(ctx, scene, role, sd, { at: castAt(ctx, 0.15), props: [] }))
      else if (ctx.hasCast(scene) && !items.length) add(s, cast(ctx, scene, role, slot(role, 'cast'), { at: castAt(ctx, 0.3) }))
      const it = slot(role, 'items')
      items.forEach((text, i) => {
        const t0 = at(0.36 + i * (0.5 / Math.max(1, items.length)))
        const top = it.top + i * it.step
        const bulletText = S.bullet ? S.bullet(i) : String(i + 1)
        add(s, T(ctx, 'bullet', bulletText, { left: it.left, top, w: 110, h: it.h, max: it.max, align: 'center', at: t0, role, index: i }))
        add(s, T(ctx, 'item', text, { left: it.left + 140, top, w: it.w - 140, h: it.h, max: it.max, at: t0 + 0.1, role, index: i }))
      })
      return finish(s, ctx, scene, role)
    }

    function cta(scene, ctx) {
      const { at, data, el, animate } = ctx
      const role = 'cta'
      const s = section(ctx, scene, role)
      const lg = slot(role, 'logo')
      if (lg.w) {
        const logo = el('img', 'st-logo'); logo.src = data.logoUrl; Object.assign(logo.style, { left: lg.left + 'px', top: lg.top + 'px', width: lg.w + 'px' })
        const e = (S.enter && S.enter.logo) || ['stFade', 0.6]; animate(logo, [e[0], e[1], at(0.03), e[2]]); add(s, logo)
      }
      add(s, T(ctx, 'head', scene.headline || 'Order online', { ...slot(role, 'head'), align: 'center', at: at(0.1), role }))
      add(s, T(ctx, 'site', data.cta.site, { ...slot(role, 'site'), align: 'center', at: at(0.25), role }))
      if (data.cta.phone) add(s, T(ctx, 'phone', '☎ ' + data.cta.phone, { ...slot(role, 'phone'), align: 'center', at: at(0.4), role }))
      add(s, T(ctx, 'button', scene.stamp || 'Order na!', { ...slot(role, 'button'), align: 'center', at: at(0.52), role }))
      if (scene.character) add(s, cast(ctx, scene, role, slot(role, 'figure'), { at: castAt(ctx, 0.45), props: [], flip: false }))
      return finish(s, ctx, scene, role)
    }

    const H = { T, make, section, finish, cast, slot, add }
    const builtIn = { hook: storyRole('hook'), problem: storyRole('problem'), solution: storyRole('solution'), product, proof, cta }
    const roles = {}
    for (const r of Object.keys(builtIn)) roles[r] = S.roles && S.roles[r] ? (scene, ctx) => S.roles[r](scene, ctx, H, builtIn[r]) : builtIn[r]
    window.STYLE = { fonts: S.fonts || [], transition: S.transition || 'stFade', cast: S.cast || { enter: 'pop' }, afterBuild: S.afterBuild, prepare: S.prepare, roles }
  }

  /**
   * Pixel styles: draws every character/prop SVG once onto a tiny canvas and
   * scales it up with hard pixels. Much faster to render than a live SVG
   * pixelate filter; the entrance/idle motion stays (on the canvas).
   */
  window.pixelateCast = async function (block = 12) {
    const NS = 'http://www.w3.org/2000/svg'
    const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight']
    const html = document.documentElement
    const svgs = [...document.querySelectorAll('.castbox svg')]
    html.classList.add('measuring')
    const jobs = svgs.map((svg) => {
      const holder = svg.parentNode
      const w = holder.clientWidth, h = holder.clientHeight
      const clone = svg.cloneNode(true)
      const src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')]
      src.forEach((el, i) => {
        const cs = getComputedStyle(el), d = dst[i]
        d.removeAttribute('style')
        PAINT.forEach((prop) => d.style.setProperty(prop, cs.getPropertyValue(prop)))
      })
      clone.setAttribute('xmlns', NS); clone.setAttribute('width', w); clone.setAttribute('height', h)
      return { svg, w, h, url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)) }
    })
    html.classList.remove('measuring')
    await Promise.all(jobs.map(async ({ svg, w, h, url }) => {
      const img = new Image(); img.src = url
      try { await img.decode() } catch { return }
      const cw = Math.max(1, Math.round(w / block)), ch = Math.max(1, Math.round(h / block))
      const c = document.createElement('canvas'); c.width = cw; c.height = ch
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, cw, ch)
      // Hard edges: each pixel is either on or off.
      const d = g.getImageData(0, 0, cw, ch)
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 90 ? 255 : 0
      g.putImageData(d, 0, 0)
      Object.assign(c.style, { width: w + 'px', height: h + 'px', display: 'block', imageRendering: 'pixelated', animation: svg.style.animation })
      c.className = 'px-art'
      svg.replaceWith(c)
    }))
  }
})()
