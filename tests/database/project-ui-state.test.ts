import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ProjectRepository } from '../../src/main/database/repositories/project.repository'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  const repo = new ProjectRepository(db)
  repo.insert({ id: 'p', title: 'Progetto', subtitle: '', author: null, year: null, description: '', notes: '', plot: '', fabula: '' })
  return { db, repo }
}

describe('ProjectRepository — stato UI del progetto (v0.3.9)', () => {
  it('vuoto per un progetto appena creato', () => {
    const { repo } = setup()
    expect(repo.getUiState('p')).toEqual({})
  })

  it('setUiState salva e getUiState rilegge', () => {
    const { repo } = setup()
    repo.setUiState('p', { lastRoute: '/characters' })
    expect(repo.getUiState('p')).toEqual({ lastRoute: '/characters' })
  })

  it('setUiState fa un merge per chiave, non sostituisce lo stato intero', () => {
    const { repo } = setup()
    repo.setUiState('p', { lastRoute: '/' })
    repo.setUiState('p', { lastSceneId: 's1' })
    expect(repo.getUiState('p')).toEqual({ lastRoute: '/', lastSceneId: 's1' })
  })

  it('una chiave può essere sovrascritta senza toccare le altre', () => {
    const { repo } = setup()
    repo.setUiState('p', { lastRoute: '/', lastSceneId: 's1' })
    repo.setUiState('p', { lastSceneId: 's2' })
    expect(repo.getUiState('p')).toEqual({ lastRoute: '/', lastSceneId: 's2' })
  })

  it('progetti diversi hanno stati indipendenti', () => {
    const { repo } = setup()
    repo.insert({ id: 'q', title: 'Altro', subtitle: '', author: null, year: null, description: '', notes: '', plot: '', fabula: '' })
    repo.setUiState('p', { lastRoute: '/characters' })
    repo.setUiState('q', { lastRoute: '/timeline' })
    expect(repo.getUiState('p')).toEqual({ lastRoute: '/characters' })
    expect(repo.getUiState('q')).toEqual({ lastRoute: '/timeline' })
  })
})
