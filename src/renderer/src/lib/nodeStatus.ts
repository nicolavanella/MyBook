import type { NodeStatus } from '@shared/schemas/document.schema'
import type { TranslationKey } from '@shared/i18n'

/**
 * Stati di una scena con etichetta e colore del "pallino".
 *
 * Fonte UNICA per l'albero del Manoscritto (ChapterTree) e per il selettore
 * Stato dell'editor (StatusSelect): prima il colore viveva solo in
 * ChapterTree e l'elenco degli stati solo in SceneEditor, quindi i due
 * potevano disallinearsi. Le classi sono scritte per intero (mai composte
 * dinamicamente) altrimenti Tailwind non le troverebbe in fase di build.
 * v0.4.0: l'etichetta è una chiave i18n (`labelKey`), tradotta dove viene mostrata.
 */
export const NODE_STATUS_OPTIONS: { value: NodeStatus; labelKey: TranslationKey; dotClass: string }[] = [
  { value: 'idea', labelKey: 'status.idea', dotClass: 'bg-gray-300' },
  { value: 'bozza', labelKey: 'status.bozza', dotClass: 'bg-amber-400' },
  { value: 'revisione', labelKey: 'status.revisione', dotClass: 'bg-blue-400' },
  { value: 'completo', labelKey: 'status.completo', dotClass: 'bg-green-500' }
]

/** Classe Tailwind del pallino per stato (lookup rapido per l'albero). */
export const STATUS_DOT: Record<string, string> = Object.fromEntries(NODE_STATUS_OPTIONS.map((o) => [o.value, o.dotClass]))
