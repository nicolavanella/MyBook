/**
 * Selezione/deselezione di un nodo (capitolo o scena) nell'export manoscritto.
 * `prev === null` è convenzionalmente "tutto selezionato" (vedi ExportPage.tsx,
 * isChecked): in quel caso il set di partenza per il toggle è `allIds`.
 *
 * Per i capitoli, `childIds` propaga lo stesso cambiamento a tutte le scene
 * contenute: deselezionando un capitolo si deselezionano automaticamente le
 * sue scene (e viceversa in selezione), così l'export non include mai una
 * scena "orfana" di un capitolo che l'utente ha esplicitamente escluso.
 * Per una scena, `childIds` va lasciato vuoto: il toggle riguarda solo lei.
 */
export function toggleSelectionCascade(
  prev: Set<string> | null,
  allIds: string[],
  id: string,
  childIds: string[] = []
): Set<string> {
  const next = new Set(prev ?? allIds)
  const willSelect = !next.has(id)
  for (const nodeId of [id, ...childIds]) {
    if (willSelect) next.add(nodeId)
    else next.delete(nodeId)
  }
  return next
}
