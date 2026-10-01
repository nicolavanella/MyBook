import type { NodeStatus } from '@shared/schemas/document.schema'

/**
 * Stati di una scena con etichetta e colore del "pallino".
 *
 * Fonte UNICA per l'albero del Manoscritto (ChapterTree) e per il selettore
 * Stato dell'editor (StatusSelect): prima il colore viveva solo in
 * ChapterTree e l'elenco degli stati solo in SceneEditor, quindi i due
 * potevano disallinearsi. Le classi sono scritte per intero (mai composte
 * dinamicamente) altrimenti Tailwind non le troverebbe in fase di build.
 */
export const NODE_STATUS_OPTIONS: { value: NodeStatus; label: string; dotClass: string }[] = [
  { value: 'idea', label: 'Idea', dotClass: 'bg-gray-300' },
  { value: 'bozza', label: 'Bozza', dotClass: 'bg-amber-400' },
  { value: 'revisione', label: 'Revisione', dotClass: 'bg-blue-400' },
  { value: 'completo', label: 'Finito', dotClass: 'bg-green-500' }
]

/** Classe Tailwind del pallino per stato (lookup rapido per l'albero). */
export const STATUS_DOT: Record<string, string> = Object.fromEntries(NODE_STATUS_OPTIONS.map((o) => [o.value, o.dotClass]))
