/**
 * Etichette (chiavi i18n) del registro attività (v0.4.0).
 *
 * Prima erano due copie identiche in LogTab e StartupRecapModal; ora una
 * sola, così un nuovo tipo di voce si aggiunge in un punto solo. Un valore
 * sconosciuto (voce scritta da una versione futura) non è in mappa: il
 * chiamante lo mostra com'è invece di nascondere la riga.
 */
import type { TranslationKey } from '@shared/i18n'

export const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  created: 'log.action.created',
  updated: 'log.action.updated',
  deleted: 'log.action.deleted',
  moved: 'log.action.moved'
}

export const ENTITY_LABEL_KEYS: Record<string, TranslationKey> = {
  scene: 'log.entity.scene',
  chapter: 'log.entity.chapter',
  group: 'log.entity.group',
  character: 'entityType.character',
  location: 'entityType.location',
  object: 'entityType.object',
  timeline: 'log.entity.timeline',
  timeline_event: 'log.entity.timelineEvent',
  mindmap: 'log.entity.mindmap',
  mindmap_node: 'log.entity.mindmapNode',
  mindmap_edge: 'log.entity.mindmapEdge'
}
