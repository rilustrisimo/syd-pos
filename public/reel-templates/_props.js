/*
 * Prop icons (ids match PROP_IDS in src/lib/marketing/reel-styles.ts).
 * drawProp(id) → <svg class="prop"> (viewBox 0 0 120 120), single-stroke
 * line art in currentColor; every stroke has class "d" so styles can draw
 * it on, and filled accents use class "f-acc".
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg'
  const P = {
    gi_sheet: '<path class="d" d="M10 40 L60 20 L110 40 L110 90 L60 110 L10 90 Z"/><path class="d" d="M26 34 V96 M43 27 V103 M60 20 V110 M77 27 V103 M94 34 V96"/>',
    gi_pipe: '<rect class="d" x="10" y="30" width="100" height="18" rx="9"/><rect class="d" x="10" y="56" width="100" height="18" rx="9"/><rect class="d" x="10" y="82" width="100" height="18" rx="9"/>',
    cyclone_wire: '<rect class="d" x="12" y="12" width="96" height="96" rx="4"/><path class="d" d="M12 36 L36 12 M12 60 L60 12 M12 84 L84 12 M12 108 L108 12 M36 108 L108 36 M60 108 L108 60 M84 108 L108 84"/><path class="d" d="M12 36 L84 108 M12 12 L108 108 M36 12 L108 84 M60 12 L108 60 M12 60 L60 108 M12 84 L36 108 M84 12 L108 36"/>',
    tie_wire: '<ellipse class="d" cx="60" cy="60" rx="46" ry="40"/><ellipse class="d" cx="60" cy="60" rx="34" ry="28"/><ellipse class="d" cx="60" cy="60" rx="20" ry="15"/><path class="d" d="M104 66 Q114 90 96 106"/>',
    hollow_block: '<path class="d" d="M10 44 L80 30 L110 44 L110 92 L40 106 L10 92 Z"/><path class="d" d="M10 44 L40 58 L110 44 M40 58 V106"/><rect class="d" x="50" y="40" width="16" height="9" rx="2"/><rect class="d" x="74" y="35" width="16" height="9" rx="2"/>',
    cement_bag: '<path class="d" d="M24 18 Q60 8 96 18 L104 104 Q60 114 16 104 Z"/><path class="d" d="M24 18 Q60 28 96 18"/><rect class="d f-acc" x="34" y="44" width="52" height="34" rx="5"/>',
    rebar: '<path class="d" d="M12 34 L108 26 M12 60 L108 52 M12 86 L108 78"/><path class="d" d="M24 28 l4 10 M40 27 l4 10 M56 26 l4 10 M72 24 l4 10 M88 23 l4 10 M24 54 l4 10 M40 53 l4 10 M56 52 l4 10 M72 50 l4 10 M88 49 l4 10 M24 80 l4 10 M40 79 l4 10 M56 78 l4 10 M72 76 l4 10 M88 75 l4 10"/>',
    plywood: '<path class="d" d="M14 36 L84 20 L106 34 L36 52 Z"/><path class="d" d="M14 36 V58 L36 74 L106 56 V34 M36 52 V74"/><path class="d" d="M14 58 V80 L36 96 L106 78 V56 M36 74 V96"/>',
    paint_can: '<ellipse class="d" cx="60" cy="34" rx="38" ry="12"/><path class="d" d="M22 34 V96 Q60 112 98 96 V34"/><path class="d f-acc" d="M22 56 Q60 70 98 56 V78 Q60 92 22 78 Z"/><path class="d" d="M28 30 Q60 -6 92 30"/>',
    pvc_pipe: '<path class="d" d="M12 48 H66 V108 M12 72 H42 V108"/><rect class="d" x="60" y="40" width="22" height="22" rx="3"/><path class="d" d="M82 48 H108 M82 72 H96 M96 72 V60"/>',
    nails: '<path class="d" d="M24 20 H52 M38 20 V100 L33 92 M38 100 L43 92"/><path class="d" d="M66 28 H94 M80 28 V104 L75 96 M80 104 L85 96"/>',
    hammer: '<path class="d" d="M54 46 L98 108 L108 100 L64 38"/><path class="d f-acc" d="M18 34 L58 12 L74 40 L34 62 Z"/><path class="d" d="M18 34 Q8 46 20 58"/>',
    shovel: '<path class="d" d="M60 10 V70 M46 10 H74"/><path class="d f-acc" d="M38 70 H82 L80 96 Q60 116 40 96 Z"/>',
    wheelbarrow: '<path class="d f-acc" d="M14 40 H86 L74 76 H30 Z"/><circle class="d" cx="44" cy="92" r="14"/><path class="d" d="M74 76 L104 96 M86 40 L110 30 M30 76 L24 104"/>',
    truck: '<rect class="d f-acc" x="8" y="34" width="64" height="48" rx="4"/><path class="d" d="M72 48 H96 L110 66 V82 H72 Z"/><path class="d" d="M80 52 H94 L102 64 H80 Z"/><circle class="d" cx="30" cy="90" r="11"/><circle class="d" cx="90" cy="90" r="11"/>',
    house: '<path class="d" d="M10 60 L60 18 L110 60"/><path class="d" d="M22 52 V106 H98 V52"/><rect class="d f-acc" x="50" y="72" width="20" height="34"/><rect class="d" x="30" y="66" width="14" height="14"/><rect class="d" x="76" y="66" width="14" height="14"/>',
    roof: '<path class="d f-acc" d="M6 70 L60 22 L114 70 Z"/><path class="d" d="M24 54 L42 70 M40 40 L72 70 M60 22 L102 60 M76 30 L96 50"/><path class="d" d="M18 70 V100 H102 V70"/>',
    fence: '<path class="d" d="M18 26 L26 16 L34 26 V106 H18 Z M52 26 L60 16 L68 26 V106 H52 Z M86 26 L94 16 L102 26 V106 H86 Z"/><path class="d" d="M8 46 H112 M8 84 H112"/>',
    pig: '<ellipse class="d f-acc" cx="58" cy="66" rx="40" ry="28"/><rect class="d" x="92" y="56" width="18" height="16" rx="7"/><circle cx="99" cy="64" r="2" fill="currentColor"/><circle cx="105" cy="64" r="2" fill="currentColor"/><path class="d" d="M80 40 L86 28 L90 44"/><path class="d" d="M34 92 V106 M50 94 V108 M68 94 V108 M82 90 V104"/><path class="d" d="M18 60 Q6 54 12 46 Q18 40 20 50"/><circle cx="84" cy="56" r="3" fill="currentColor"/>',
    chicken: '<path class="d f-acc" d="M30 54 Q30 92 64 92 Q96 92 98 62 Q100 44 84 38 Q78 22 66 26 Q58 30 62 42 Q46 50 30 54 Z"/><path class="d" d="M66 26 L64 14 L72 22 L76 12 L78 26"/><path class="d" d="M84 38 L98 40 L86 46"/><circle cx="74" cy="34" r="3" fill="currentColor"/><path class="d" d="M56 92 V108 M50 108 H62 M74 92 V108 M68 108 H80"/><path class="d" d="M30 54 Q16 46 18 30 Q26 42 36 46"/>',
    rain_cloud: '<path class="d f-acc" d="M30 62 Q12 62 12 46 Q12 30 30 32 Q36 12 58 14 Q78 14 84 32 Q106 30 108 48 Q108 62 92 62 Z"/><path class="d" d="M32 74 L26 90 M54 74 L48 90 M76 74 L70 90 M44 94 L38 110 M66 94 L60 110 M88 94 L82 110"/>',
    sun: '<circle class="d f-acc" cx="60" cy="60" r="24"/><path class="d" d="M60 10 V24 M60 96 V110 M10 60 H24 M96 60 H110 M25 25 L35 35 M85 85 L95 95 M95 25 L85 35 M35 85 L25 95"/>',
    water_drop: '<path class="d f-acc" d="M60 10 Q94 54 94 76 Q94 108 60 108 Q26 108 26 76 Q26 54 60 10 Z"/><path class="d" d="M44 78 Q44 92 56 96"/>',
    crack: '<rect class="d" x="10" y="20" width="100" height="80" rx="4"/><path class="d" d="M48 20 L56 40 L44 54 L60 70 L52 86 L62 100"/><path class="d" d="M56 40 L72 46 M44 54 L30 60 M60 70 L78 74"/>',
    rust: '<rect class="d" x="12" y="24" width="96" height="72" rx="6"/><circle class="d f-acc" cx="40" cy="50" r="10"/><circle class="d f-acc" cx="76" cy="72" r="13"/><circle class="d f-acc" cx="82" cy="40" r="6"/><circle class="d f-acc" cx="34" cy="80" r="6"/>',
    sand: '<path class="d f-acc" d="M8 100 Q30 52 60 44 Q92 52 112 100 Z"/><path class="d" d="M28 84 l2 0 M44 70 l2 0 M60 60 l2 0 M74 76 l2 0 M88 88 l2 0 M52 90 l2 0 M66 94 l2 0 M38 94 l2 0 M80 64 l2 0"/><path class="d" d="M4 104 H116"/>',
    gravel: '<path class="d" d="M8 100 Q30 50 60 42 Q92 50 112 100 Z"/><path class="d f-acc" d="M30 92 l8 -9 l11 2 l2 9 l-9 5 Z M56 88 l7 -10 l12 3 l1 10 l-12 2 Z M82 94 l6 -8 l10 3 l-1 8 Z M44 70 l8 -8 l10 3 l-2 9 l-10 2 Z M68 64 l6 -7 l9 4 l-2 7 Z M54 50 l6 -4 l7 4 l-4 6 Z"/><path class="d" d="M4 104 H116"/>',
    board: '<path class="d f-acc" d="M34 10 L94 18 L94 110 L34 102 Z"/><path class="d" d="M26 16 L34 10 M26 16 L26 106 L34 102"/><path class="d" d="M44 24 l1 0 M84 30 l1 0 M44 60 l1 0 M84 64 l1 0 M44 94 l1 0 M84 98 l1 0"/>',
    lumber: '<path class="d f-acc" d="M10 46 L84 34 L110 42 L36 56 Z"/><path class="d" d="M10 46 V62 L36 72 V56 M36 72 L110 58 V42"/><path class="d f-acc" d="M10 70 L84 58 L110 66 L36 80 Z"/><path class="d" d="M10 70 V86 L36 96 V80 M36 96 L110 82 V66"/><path class="d" d="M18 56 q4 -3 9 0 M18 80 q4 -3 9 0"/>',
    wall: '<rect class="d f-acc" x="10" y="26" width="100" height="78"/><path class="d" d="M10 52 H110 M10 78 H110 M43 26 V52 M76 26 V52 M26 52 V78 M60 52 V78 M94 52 V78 M43 78 V104 M76 78 V104"/>',
    tiles: '<path class="d" d="M60 22 L108 46 L60 70 L12 46 Z"/><path class="d" d="M36 34 L84 58 M84 34 L36 58"/><path class="d f-acc" d="M60 22 L84 34 L60 46 L36 34 Z"/><path class="d" d="M12 46 V62 L60 86 L108 62 V46 M60 70 V86"/>',
    angle_bar: '<path class="d f-acc" d="M10 92 L84 18 L98 18 L24 92 Z"/><path class="d" d="M10 92 L10 106 L24 106 L98 32 L98 18 M24 92 V106"/>',
    purlin: '<path class="d f-acc" d="M88 20 H22 V108 H88 V96 H36 V32 H88 Z"/><path class="d" d="M22 20 L44 6 H110 L88 20 M110 6 V18 L88 32"/>',
    door: '<rect class="d" x="26" y="8" width="68" height="104"/><rect class="d f-acc" x="34" y="16" width="52" height="88"/><path class="d" d="M42 28 H78 V54 H42 Z M42 66 H78 V92 H42 Z"/><circle class="d" cx="78" cy="62" r="4"/>',
    paint_roller: '<rect class="d f-acc" x="16" y="14" width="76" height="26" rx="10"/><path class="d" d="M92 27 H106 V54 H60 V72"/><rect class="d" x="52" y="72" width="16" height="40" rx="5"/>',
    sealant: '<path class="d f-acc" d="M20 60 L82 36 L96 72 L34 96 Z"/><path class="d" d="M82 36 L104 26 M96 72 L112 66 M104 26 L112 66"/><path class="d" d="M20 60 L6 66 L12 80 L34 96 M6 66 L-2 70"/>',
    faucet: '<path class="d f-acc" d="M14 40 H66 Q90 40 90 64 V72 H76 V64 Q76 54 66 54 H14 Z"/><path class="d" d="M40 40 V26 M26 26 H54"/><path class="d" d="M83 82 q-4 8 0 12 q4 -4 0 -12 M83 100 q-3 6 0 9 q3 -3 0 -9"/>',
    electrical_wire: '<ellipse class="d f-acc" cx="50" cy="60" rx="38" ry="38"/><ellipse class="d" cx="50" cy="60" rx="14" ry="14"/><path class="d" d="M50 22 Q96 22 98 60 Q100 88 112 92"/><path class="d" d="M24 32 A38 38 0 0 1 76 32 M18 74 A38 38 0 0 0 82 74"/>',
    bulb: '<path class="d f-acc" d="M60 10 Q92 10 92 44 Q92 62 76 76 V86 H44 V76 Q28 62 28 44 Q28 10 60 10 Z"/><path class="d" d="M44 92 H76 M46 100 H74 M52 108 H68 M52 62 L60 44 L68 62"/><path class="d" d="M14 30 L4 24 M106 30 L116 24 M60 2 V-6"/>',
    // Fallback for a product with no photo and no matching prop (not offered to Gemini).
    crate: '<path class="d f-acc" d="M14 40 L60 22 L106 40 L106 90 L60 108 L14 90 Z"/><path class="d" d="M14 40 L60 58 L106 40 M60 58 V108"/><path class="d" d="M37 31 L83 49"/>',
    phone: '<rect class="d" x="34" y="8" width="52" height="104" rx="10"/><path class="d" d="M50 18 H70 M54 100 H66"/><path class="d f-acc" d="M44 34 H76 V72 H44 Z"/>',
  }

  window.PROP_IDS = Object.keys(P)
  window.drawProp = function (id) {
    if (!P[id]) return null
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 120 120')
    svg.setAttribute('class', 'prop prop-' + id)
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.innerHTML = P[id]
    return svg
  }
})()
