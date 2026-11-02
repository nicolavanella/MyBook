import { describe, expect, it } from 'vitest'
import { DESCRIPTION_COPY_TYPES, linkedEntityTarget } from '@renderer/lib/mindmapLinks'

describe('linkedEntityTarget', () => {
  it('personaggio, località, oggetto ed evento portano alla pagina giusta con la selezione', () => {
    expect(linkedEntityTarget('character', 'c1')).toEqual({ entityType: 'character', route: '/characters', id: 'c1' })
    expect(linkedEntityTarget('location', 'l1')).toEqual({ entityType: 'location', route: '/locations', id: 'l1' })
    expect(linkedEntityTarget('object', 'o1')).toEqual({ entityType: 'object', route: '/objects', id: 'o1' })
    expect(linkedEntityTarget('event', 'e1')).toEqual({ entityType: 'event', route: '/timeline', id: 'e1' })
  })

  it('nota libera, gruppo, capitolo e scena non hanno una scheda da aprire', () => {
    for (const type of ['free_note', 'group', 'chapter', 'scene', 'altro']) {
      expect(linkedEntityTarget(type, 'x'), type).toBeNull()
    }
  })

  it('senza ref_id (nullo, indefinito o vuoto) non c\'è collegamento', () => {
    expect(linkedEntityTarget('character', null)).toBeNull()
    expect(linkedEntityTarget('character', undefined)).toBeNull()
    expect(linkedEntityTarget('character', '')).toBeNull()
  })

  it('la copia della descrizione vale per gli stessi quattro tipi', () => {
    expect([...DESCRIPTION_COPY_TYPES].sort()).toEqual(['character', 'event', 'location', 'object'])
  })
})
