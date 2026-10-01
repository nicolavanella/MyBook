import { describe, it, expect } from 'vitest'
import { filterTimelineEvents } from '@renderer/features/timeline/timelineSearch'

const EVENTS = [
  { title: 'Battaglia di Rivendell', event_date: 'Anno 1200', description: 'Uno scontro decisivo' },
  { title: 'Incoronazione', event_date: 'Anno 1250', description: 'Il re sale al trono' },
  { title: 'Fuga notturna', event_date: '', description: 'Nessuna data narrativa assegnata' }
]

describe('filterTimelineEvents', () => {
  it('ritorna tutti gli eventi con query vuota', () => {
    expect(filterTimelineEvents(EVENTS, '')).toHaveLength(3)
  })

  it('filtra per titolo (fix: prima non veniva considerato)', () => {
    const result = filterTimelineEvents(EVENTS, 'incoronazione')
    expect(result.map((e) => e.title)).toEqual(['Incoronazione'])
  })

  it('filtra per data narrativa', () => {
    const result = filterTimelineEvents(EVENTS, '1250')
    expect(result.map((e) => e.title)).toEqual(['Incoronazione'])
  })

  it('filtra per testo della descrizione', () => {
    const result = filterTimelineEvents(EVENTS, 'trono')
    expect(result.map((e) => e.title)).toEqual(['Incoronazione'])
  })

  it('la ricerca è case-insensitive', () => {
    expect(filterTimelineEvents(EVENTS, 'BATTAGLIA')).toHaveLength(1)
  })

  it('nessun risultato per un termine assente ovunque', () => {
    expect(filterTimelineEvents(EVENTS, 'introvabile')).toHaveLength(0)
  })
})

describe('filterTimelineEvents — data da calendario (v0.3.4)', () => {
  const withDates = [
    { title: 'Battaglia', event_date: 'Anno 1200', description: 'x', calendar_date: '2026-09-21' },
    { title: 'Fuga', event_date: '', description: 'y', calendar_date: '' }
  ]
  const fmt = (iso: string) => (iso === '2026-09-21' ? 'lunedì, 21/09/2026' : '')

  it('trova per data in formato ISO', () => {
    expect(filterTimelineEvents(withDates, '2026-09-21', fmt).map((e) => e.title)).toEqual(['Battaglia'])
  })
  it('trova per data come mostrata a schermo (giorno/mese/anno e nome del giorno)', () => {
    expect(filterTimelineEvents(withDates, '21/09/2026', fmt)).toHaveLength(1)
    expect(filterTimelineEvents(withDates, 'LUNEDÌ', fmt)).toHaveLength(1)
  })
  it('senza formattatore cerca comunque nell\'ISO; eventi senza data non producono falsi positivi', () => {
    expect(filterTimelineEvents(withDates, '2026')).toHaveLength(1)
    expect(filterTimelineEvents(withDates, '21/09')).toHaveLength(0)
  })
})
