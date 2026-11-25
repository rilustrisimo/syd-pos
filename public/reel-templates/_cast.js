/*
 * Recurring cast as stick-style figures (ids match src/lib/marketing/cast.ts).
 * drawFigure({ cast, pose, mood }) → <svg class="fig"> (viewBox 0 0 300 440).
 * Everything is stroked in currentColor; paths that "draw on" have class "d";
 * the head/hat fills use class "f" (styles set --fig-fill / --fig-accent).
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg'
  const NECK = [150, 112], SHOULDER = [150, 140], HIP = [150, 255]

  // Joint positions per pose: [elbowR, handR, elbowL, handL, kneeR, footR, kneeL, footL]
  // (R = viewer's right). Legs default to standing.
  const STAND_LEGS = [[172, 335], [182, 420], [128, 335], [118, 420]]
  const POSES = {
    stand: [[185, 200], [195, 258], [115, 200], [105, 258], ...STAND_LEGS],
    walk: [[188, 198], [212, 248], [118, 196], [96, 238], [178, 330], [204, 412], [132, 335], [104, 404]],
    point: [[212, 122], [278, 92], [115, 200], [105, 258], ...STAND_LEGS],
    think: [[200, 192], [168, 112], [118, 200], [170, 206], ...STAND_LEGS],
    worried: [[208, 112], [186, 56], [92, 112], [114, 56], ...STAND_LEGS],
    happy: [[206, 96], [234, 40], [94, 96], [66, 40], ...STAND_LEGS],
    carry: [[188, 192], [178, 222], [112, 192], [122, 222], ...STAND_LEGS],
    shrug: [[204, 176], [236, 140], [96, 176], [64, 140], ...STAND_LEGS],
    thumbs_up: [[212, 192], [218, 130], [115, 200], [105, 258], ...STAND_LEGS],
    phone: [[206, 170], [176, 96], [115, 200], [105, 258], ...STAND_LEGS],
  }

  const FACES = {
    happy: '<path class="d" d="M134 84 Q150 100 166 84"/>',
    worried: '<path class="d" d="M134 94 Q150 80 166 94"/><path class="d" d="M126 52 L140 58 M174 52 L160 58"/>',
    surprised: '<ellipse class="d" cx="150" cy="90" rx="8" ry="10"/>',
    thinking: '<path class="d" d="M136 90 L164 86"/>',
    neutral: '<path class="d" d="M138 88 Q150 94 162 88"/>',
  }

  // Headwear per cast member.
  const HATS = {
    ramon: '<path class="d f-hat" d="M76 44 Q150 18 224 44 Q150 54 76 44 Z"/><path class="d f-hat" d="M112 40 Q116 6 150 4 Q184 6 188 40"/>',
    joy: '<path class="d f-hat" d="M104 46 Q104 2 150 2 Q196 2 196 46 Z"/><path class="d" d="M94 46 L206 46"/><path class="d" d="M150 4 L150 22"/>',
    ben: '<path class="d f-hat" d="M108 44 Q110 6 150 6 Q188 6 192 40 Z"/><path class="d" d="M188 40 L232 46"/>',
    lyn: '<path class="d f-hat" d="M108 44 Q110 6 150 6 Q188 6 192 40 Z"/><path class="d" d="M188 40 L232 46"/><text x="150" y="34" text-anchor="middle" class="fig-logo">SYD</text>',
  }

  // Hat colours (styles can override with --hat-fill, e.g. none for line-only looks).
  const HAT_COLORS = { ramon: '#E9C46A', joy: '#F4A261', ben: '#3A86FF', lyn: '#E63946' }

  const MARKS = {
    worried: '<path class="d mark" d="M222 70 Q232 86 222 96 Q212 86 222 70 Z"/><path class="d mark" d="M244 98 Q252 110 244 118 Q236 110 244 98 Z"/>',
    thinking: '<path class="d mark" d="M230 34 Q230 12 252 12 Q274 12 272 32 Q270 46 252 52 L252 66"/><circle class="d mark" cx="252" cy="82" r="3"/>',
    happy: '<path class="d mark" d="M232 30 L248 14 M244 44 L268 38 M222 20 L224 0"/><path class="d mark" d="M68 30 L52 14 M56 44 L32 38 M78 20 L76 0"/>',
    surprised: '<path class="d mark" d="M252 10 L252 54"/><circle class="d mark" cx="252" cy="70" r="4"/>',
  }

  const pt = (p) => `${p[0]} ${p[1]}`

  window.drawFigure = function ({ cast = 'ben', pose = 'stand', mood, flip, rods } = {}) {
    const j = POSES[pose] || POSES.stand
    const [eR, hR, eL, hL, kR, fR, kL, fL] = j
    const face = FACES[mood] || (pose === 'happy' || pose === 'thumbs_up' ? FACES.happy : pose === 'worried' ? FACES.worried : FACES.neutral)
    const extra = pose === 'thumbs_up' ? `<path class="d" d="M${hR[0]} ${hR[1]} L${hR[0] + 2} ${hR[1] - 26}"/>`
      : pose === 'phone' ? `<rect class="d f-acc" x="${hR[0] - 14}" y="${hR[1] - 34}" width="22" height="40" rx="5"/>`
      : pose === 'carry' ? '<rect class="d f-acc" x="112" y="206" width="76" height="56" rx="4"/>' : ''
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 300 440')
    svg.setAttribute('class', 'fig fig-' + cast)
    svg.style.setProperty('--cast-color', HAT_COLORS[cast] || '#999')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    // Mirrored figures face left; the cap logo stays readable (it sits on the centre line).
    const hat = HATS[cast] || ''
    const logo = (hat.match(/<text[\s\S]*<\/text>/) || [''])[0]
    svg.innerHTML = `<g${flip ? ' transform="translate(300 0) scale(-1 1)"' : ''}>
      <g class="fig-body">
        <path class="d" d="M${pt(NECK)} L${pt(HIP)}"/>
        <path class="d" d="M${pt(HIP)} L${pt(kR)} L${pt(fR)}"/>
        <path class="d" d="M${pt(HIP)} L${pt(kL)} L${pt(fL)}"/>
      </g>
      ${rods ? `<g class="fig-rods"><path class="d rod" d="M${pt(hR)} L${hR[0] + 30} 520"/><path class="d rod" d="M${pt(hL)} L${hL[0] - 30} 520"/></g>` : ''}
      <g class="fig-arms">
        <path class="d" d="M${pt(SHOULDER)} L${pt(eR)} L${pt(hR)}"/>
        <path class="d" d="M${pt(SHOULDER)} L${pt(eL)} L${pt(hL)}"/>
        ${extra}
      </g>
      <g class="fig-head">
        <circle class="d f-head" cx="150" cy="72" r="40"/>
        <circle cx="137" cy="68" r="4" class="eye"/><circle cx="163" cy="68" r="4" class="eye"/>
        ${face}
        ${hat.replace(logo, '')}
      </g>
      ${mood && MARKS[mood] ? `<g class="fig-mark">${MARKS[mood]}</g>` : ''}
      </g>${logo}`
    return svg
  }
})()
