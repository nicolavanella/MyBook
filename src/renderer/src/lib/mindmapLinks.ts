/**
 * MyBook — collegamento fra un nodo della Mappa concettuale e la sua scheda (v0.4.1).
 *
 * Un nodo di tipo Personaggio, Località, Oggetto o Evento punta a una
 * scheda tramite `ref_id`. Dalla finestra "Modifica nodo" si può aprire
 * quella scheda: la destinazione è la pagina dell'elemento + la selezione
 * dell'elemento stesso, passata con lo stesso ponte usato dai tag
 * dell'editor (useEntityNavigationStore).
 */
import type { EntityTagType } from '@renderer/stores/useEntityNavigationStore'

export interface LinkedEntityTarget {
  /** Tipo di elemento, nel formato del ponte di navigazione. */
  entityType: EntityTagType
  /** Percorso della pagina che mostra l'elenco di quel tipo. */
  route: string
  /** Id dell'elemento da selezionare. */
  id: string
}

const TARGETS: Record<string, { entityType: EntityTagType; route: string }> = {
  character: { entityType: 'character', route: '/characters' },
  location: { entityType: 'location', route: '/locations' },
  object: { entityType: 'object', route: '/objects' },
  event: { entityType: 'event', route: '/timeline' }
}

/**
 * La scheda collegata a un nodo, o null se il nodo non ne ha una (nota libera,
 * gruppo, capitolo, scena — che non hanno una pagina di schede — oppure
 * `ref_id` mancante).
 */
export function linkedEntityTarget(nodeType: string, refId: string | null | undefined): LinkedEntityTarget | null {
  const target = TARGETS[nodeType]
  if (!target || !refId) return null
  return { ...target, id: refId }
}

/** Tipi di nodo la cui descrizione viene copiata dalla scheda al momento della creazione. */
export const DESCRIPTION_COPY_TYPES: ReadonlySet<string> = new Set(['character', 'location', 'object', 'event'])
