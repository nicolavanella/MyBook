export interface ManuscriptTreeNode {
  id: string
  parent_id: string | null
  node_type: string
  order_index: number
}

/**
 * Elementi di primo livello dell'albero del manoscritto: gruppi e capitoli
 * senza gruppo, nell'ordine reale con cui compaiono (condividono lo stesso
 * spazio di order_index, essendo entrambi a parent_id NULL — vedi
 * document.service.ts). Usata sia da ChapterTree.tsx (albero editabile) sia
 * da ExportPage.tsx (selezione per l'export), così l'ordine mostrato in
 * esportazione coincide sempre con quello del Manoscritto.
 */
export function getRootItems<T extends ManuscriptTreeNode>(tree: T[]): T[] {
  return tree
    .filter((n) => n.parent_id === null && (n.node_type === 'chapter' || n.node_type === 'group'))
    .sort((a, b) => a.order_index - b.order_index)
}

/** Capitoli contenuti in un gruppo, in ordine. */
export function getChaptersOfGroup<T extends ManuscriptTreeNode>(tree: T[], groupId: string): T[] {
  return tree
    .filter((n) => n.node_type === 'chapter' && n.parent_id === groupId)
    .sort((a, b) => a.order_index - b.order_index)
}

/** Scene contenute in un capitolo, in ordine. */
export function getScenesOfChapter<T extends ManuscriptTreeNode>(tree: T[], chapterId: string): T[] {
  return tree.filter((n) => n.parent_id === chapterId).sort((a, b) => a.order_index - b.order_index)
}
