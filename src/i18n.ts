import { EN } from './i18n/en'
import { TR, type Strings } from './i18n/tr'
import { pickLang } from './lang'

/** Every piece of UI text, in the player's language (see lang.ts). */
export const LANG = pickLang(typeof navigator === 'undefined' ? [] : navigator.languages, typeof location === 'undefined' ? '' : location.search)
export const T: Strings = LANG === 'tr' ? TR : EN

/** The title that goes with a level: a new one every 5 levels. */
export function levelTitle(level: number): string {
  return T.titles[Math.min(T.titles.length - 1, Math.floor(level / 5))]
}

/** The player is shown as "YOU" / "SEN"; bots by a name in the player's language, marked 🤖. */
export function displayName(actor: { readonly isBot: boolean; readonly id: number; readonly name: string }): string {
  return actor.isBot ? `🤖 ${T.botNames[(actor.id - 1) % T.botNames.length]}` : T.you
}
