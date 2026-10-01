import { describe, it, expect } from 'vitest'
import { formatCalendarDate, isValidIsoDate, isSameLocalDay } from '@shared/calendarDate'
import { TimelineEventUpdateInput } from '@shared/schemas/domain.schema'

describe('isValidIsoDate', () => {
  it('accetta date reali, anche bisestili', () => {
    expect(isValidIsoDate('2026-09-21')).toBe(true)
    expect(isValidIsoDate('2024-02-29')).toBe(true)
  })
  it('rifiuta date inesistenti che una regex accetterebbe', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2025-02-29')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2026-00-10')).toBe(false)
  })
  it('rifiuta formati diversi da AAAA-MM-GG e la stringa vuota', () => {
    expect(isValidIsoDate('21/09/2026')).toBe(false)
    expect(isValidIsoDate('2026-9-1')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
  })
})

describe('formatCalendarDate', () => {
  it('formatta "Nome giorno, GG/MM/AAAA" in italiano', () => {
    expect(formatCalendarDate('2026-09-21', 'it')).toBe('lunedì, 21/09/2026')
    expect(formatCalendarDate('2026-01-04', 'it')).toBe('domenica, 04/01/2026')
  })
  it("usa l'inglese per il nome del giorno mantenendo GG/MM/AAAA", () => {
    expect(formatCalendarDate('2026-09-21', 'en')).toBe('Monday, 21/09/2026')
  })
  it('ritorna stringa vuota per valori vuoti o non validi', () => {
    expect(formatCalendarDate('')).toBe('')
    expect(formatCalendarDate(null)).toBe('')
    expect(formatCalendarDate('2026-02-30')).toBe('')
  })
  it('gestisce anni con meno di 4 cifre senza scambiarli per 19xx', () => {
    expect(formatCalendarDate('0800-12-25', 'en')).toMatch(/^\w+, 25\/12\/0800$/)
  })
})

describe('TimelineEventUpdateInput — calendar_date', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  it('accetta una data valida e la stringa vuota (rimozione)', () => {
    expect(TimelineEventUpdateInput.safeParse({ id, fields: { calendar_date: '2026-09-21' } }).success).toBe(true)
    expect(TimelineEventUpdateInput.safeParse({ id, fields: { calendar_date: '' } }).success).toBe(true)
  })
  it('rifiuta date inesistenti o in formato errato', () => {
    expect(TimelineEventUpdateInput.safeParse({ id, fields: { calendar_date: '2026-02-30' } }).success).toBe(false)
    expect(TimelineEventUpdateInput.safeParse({ id, fields: { calendar_date: '21/09/2026' } }).success).toBe(false)
  })
})

describe('isSameLocalDay', () => {
  it('stesso giorno, orari diversi -> true', () => {
    expect(isSameLocalDay(new Date(2026, 8, 21, 8, 0), new Date(2026, 8, 21, 23, 59))).toBe(true)
  })
  it('giorni diversi -> false', () => {
    expect(isSameLocalDay(new Date(2026, 8, 21, 23, 59), new Date(2026, 8, 22, 0, 1))).toBe(false)
  })
  it('mesi/anni diversi con lo stesso giorno del mese -> false', () => {
    expect(isSameLocalDay(new Date(2026, 8, 21), new Date(2026, 9, 21))).toBe(false)
    expect(isSameLocalDay(new Date(2025, 8, 21), new Date(2026, 8, 21))).toBe(false)
  })
})
