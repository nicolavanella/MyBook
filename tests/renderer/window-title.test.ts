import { describe, it, expect } from 'vitest'
import { buildWindowTitle } from '@renderer/lib/windowTitle'

describe('buildWindowTitle', () => {
  it('con scena in editing: MyBook - Progetto - Manoscritto - Capitolo / Scena', () => {
    expect(
      buildWindowTitle({ projectTitle: 'Romanzo', sectionLabel: 'Manoscritto', chapterTitle: 'Capitolo 1', sceneTitle: 'L\'arrivo' })
    ).toBe("MyBook - Romanzo - Manoscritto - Capitolo 1 / L'arrivo")
  })
  it('senza scena: solo progetto e sezione (comportamento v0.2.7)', () => {
    expect(buildWindowTitle({ projectTitle: 'Romanzo', sectionLabel: 'Personaggi' })).toBe('MyBook - Romanzo - Personaggi')
  })
  it('scena senza capitolo: mostra solo la scena, senza "/" pendente', () => {
    expect(buildWindowTitle({ projectTitle: 'R', sectionLabel: 'Manoscritto', sceneTitle: 'Scena' })).toBe('MyBook - R - Manoscritto - Scena')
  })
  it('senza progetto: omette le parti mancanti; titoli vuoti/spazi ignorati', () => {
    expect(buildWindowTitle({})).toBe('MyBook')
    expect(buildWindowTitle({ projectTitle: '  ', sectionLabel: 'Progetti' })).toBe('MyBook - Progetti')
  })
})
