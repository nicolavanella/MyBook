/**
 * Utilità colore (v0.4.1) per lo sfondo dei gruppi del kanban.
 *
 * Lo sfondo di una colonna è il colore scelto con TRASPARENZA, non pieno:
 * lo stesso colore resta leggibile sia nel tema chiaro sia in quello
 * scuro (si "mescola" con lo sfondo dell'app) e non serve scegliere due
 * tonalità per tema.
 */

const HEX6 = /^#[0-9a-f]{6}$/i
const HEX3 = /^#[0-9a-f]{3}$/i

/** Colori predefiniti proposti per i gruppi (pastello: con la trasparenza restano morbidi). */
export const GROUP_COLOR_PRESETS: readonly string[] = [
  '#fde68a', '#fecaca', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8', '#cbd5e1'
]

export function isHexColor(value: string): boolean {
  return HEX6.test(value) || HEX3.test(value)
}

/** "#abc" → "#aabbcc"; un valore non valido resta null. */
export function normalizeHexColor(value: string): string | null {
  if (HEX6.test(value)) return value.toLowerCase()
  if (HEX3.test(value)) {
    const [, r, g, b] = value.toLowerCase().split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

/** Colore esadecimale → `rgba(r, g, b, alpha)`; undefined se vuoto o non valido (nessuno sfondo personalizzato). */
export function tintColor(value: string | null | undefined, alpha: number): string | undefined {
  const hex = value ? normalizeHexColor(value) : null
  if (!hex) return undefined
  const a = Math.min(1, Math.max(0, alpha))
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
