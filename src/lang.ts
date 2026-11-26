export type Lang = 'tr' | 'en'

/** Turkish for a browser whose first language is Turkish, English for everyone else; `?lang=` overrides. */
export function pickLang(languages: readonly string[], search: string): Lang {
  const asked = new URLSearchParams(search).get('lang')
  if (asked === 'tr' || asked === 'en') return asked
  return (languages[0] ?? '').toLowerCase().startsWith('tr') ? 'tr' : 'en'
}
