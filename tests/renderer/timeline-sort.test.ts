import { describe, it, expect } from 'vitest'
import { sortTimelineEvents } from '@renderer/features/timeline/timelineSort'

const EV = (id: string, event_date: string, calendar_date = '') => ({ id, event_date, calendar_date })

describe('sortTimelineEvents', () => {
  const events = [EV('a', 'Anno 10', '2026-03-01'), EV('b', 'Anno 2', '2025-12-31'), EV('c', '', ''), EV('d', 'anno 1', '2026-01-15')]

  it("'none' restituisce l'ordine manuale invariato", () => {
    expect(sortTimelineEvents(events, 'none').map((e) => e.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('data narrativa: ordine naturale (2 prima di 10), maiuscole ignorate, vuoti in fondo', () => {
    expect(sortTimelineEvents(events, 'narrative').map((e) => e.id)).toEqual(['d', 'b', 'a', 'c'])
  })
  it('data: cronologico, senza data in fondo', () => {
    expect(sortTimelineEvents(events, 'date').map((e) => e.id)).toEqual(['b', 'd', 'a', 'c'])
  })
  it('a parità di valore mantiene l\'ordine manuale (stabile)', () => {
    const tied = [EV('x', '', '2026-05-05'), EV('y', '', '2026-05-05'), EV('z', '', '2026-01-01')]
    expect(sortTimelineEvents(tied, 'date').map((e) => e.id)).toEqual(['z', 'x', 'y'])
  })
  it("non muta l'array di input", () => {
    const copy = [...events]
    sortTimelineEvents(events, 'date')
    expect(events).toEqual(copy)
  })
})
