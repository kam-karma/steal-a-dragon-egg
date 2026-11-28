/** Phones (portrait or landscape): panels start folded so the game stays visible. */
export function isSmallScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 700px), (max-height: 500px)').matches
}

/**
 * On phones the side buttons fold into one ☰ menu (the shop stays out on its own):
 * fewer, smaller buttons and more game on screen. Tapping a menu item closes the menu.
 */
export function sideMenu(root: HTMLElement): void {
  const btn = document.createElement('button')
  btn.className = 'menubtn'
  btn.textContent = '☰'
  root.appendChild(btn)
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    document.body.classList.toggle('menu-open')
  })
  document.addEventListener('pointerdown', (e) => {
    const t = e.target
    if (t instanceof Element && t.closest('.mute, .wardbtn, .crownbtn, .bookbtn') !== null) {
      window.setTimeout(() => document.body.classList.remove('menu-open'), 150)
    }
  }, true)
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
