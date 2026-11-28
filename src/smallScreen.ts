/** Phones (portrait or landscape): panels start folded so the game stays visible. */
export function isSmallScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 700px), (max-height: 500px)').matches
}

/** Makes a panel fold and unfold when its header is tapped; folded from the start on small screens. */
export function foldable(panel: HTMLElement, header: () => HTMLElement | null): void {
  if (isSmallScreen()) panel.classList.add('folded')
  panel.addEventListener('pointerdown', (e) => {
    const h = header()
    if (h === null || !(e.target instanceof Node) || !h.contains(e.target)) return
    e.stopPropagation()
    panel.classList.toggle('folded')
  })
}
