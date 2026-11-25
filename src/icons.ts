/** Painted icons (generated in AI Studio, cut out in tools/slice_sheet.py), served from public/ui/icons. */
export type IconName =
  | 'luck' | 'recover' | 'gold2x' | 'lullaby' | 'instantHatch' | 'grow' | 'totem' | 'boots' | 'streakShield'
  | 'coin' | 'pan' | 'gift' | 'wardrobe' | 'crown' | 'nest' | 'eye' | 'trophy' | 'rainbowEgg'

/** Relative URL: Poki serves the game from a sub-path. */
export const iconUrl = (name: IconName): string => `./ui/icons/${name}.png`

export function icon(name: IconName, cls = 'ic'): string {
  return `<img class="${cls}" src="${iconUrl(name)}" alt="" draggable="false">`
}
