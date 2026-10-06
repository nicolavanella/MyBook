/** true su macOS: lì il modificatore "Mod" delle scorciatoie è Cmd (⌘) invece di Ctrl. Calcolato una volta sola. */
export const IS_MAC: boolean =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')
