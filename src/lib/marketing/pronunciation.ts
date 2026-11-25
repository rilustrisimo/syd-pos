// Pronunciation help for SSML narration (Neural2 voices, incl. the Filipino
// fil-PH voices). The script stays as written for captions; only the audio
// gets these hints:
//   - acronyms are spelled letter by letter (SYD → "S-Y-D", not "seed");
//     the owner picked SSML <say-as interpret-as="characters"> by ear
//   - the website reads as "S-Y-D construct dot com"
//   - units read as words (40kg → "40 kilo")
// Input must already be XML-escaped text (no tags).

const ACRONYMS = ['SYD', 'PVC', 'PPR', 'HDPE', 'CHB', 'COD', 'DIY', 'LPG', 'GI', 'MDF', 'UPVC']

const spell = (letters: string) => `<say-as interpret-as="characters">${letters}</say-as>`

export function pronunciationSsml(escapedText: string): string {
  let t = escapedText
  // Website first, so its "syd" isn't treated separately.
  t = t.replace(/\bsydconstruct\.com\b/gi, `${spell('SYD')} construct dot com`)
  // Dotted acronyms: G.I., P.V.C.
  t = t.replace(/\b((?:[A-Za-z]\.){2,})/g, (m) => spell(m.replace(/\./g, '').toUpperCase()) + ' ')
  // Known acronyms written plainly (whole words, any case for SYD).
  t = t.replace(new RegExp(`\\b(${ACRONYMS.join('|')})\\b`, 'g'), (m) => spell(m))
  t = t.replace(/\bsyd\b/gi, spell('SYD'))
  // Units
  t = t.replace(/(\d)\s?kgs?\b/gi, '$1 kilo')
  t = t.replace(/(\d)\s?mm\b/gi, '$1 millimeter')
  t = t.replace(/(\d)\s?(ft|feet)\b/gi, '$1 feet')
  t = t.replace(/(\d)\s?m\b/g, '$1 meter')
  return t.replace(/\s{2,}/g, ' ')
}
