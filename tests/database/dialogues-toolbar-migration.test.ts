import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { runMigrations } from '../../src/main/database/migrations/runner'

const DIR = path.join(__dirname, '../../database/migrations')

/** Applica le migrazioni fino alla 022 in una cartella temporanea, per simulare un database v0.3.8. */
function dbBefore023() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'))
  for (const f of fs.readdirSync(DIR).filter((n) => parseInt(n) <= 22)) fs.copyFileSync(path.join(DIR, f), path.join(tmp, f))
  runMigrations(db, tmp)
  return { db, tmp }
}

describe('migrazione 023 — strumento Dialoghi (v0.3.9)', () => {
  it('lo inserisce subito prima di "blockquote" nell\'elenco di default', () => {
    const { db, tmp } = dbBefore023()
    runMigrations(db, DIR)
    const row = db.prepare('SELECT editor_toolbar_tools FROM app_settings').get() as any
    const tools: string[] = JSON.parse(row.editor_toolbar_tools)
    expect(tools.indexOf('dialogues')).toBe(tools.indexOf('blockquote') - 1)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('non tocca una lista personalizzata senza "blockquote" (nessun punto di inserimento)', () => {
    const { db, tmp } = dbBefore023()
    db.prepare('UPDATE app_settings SET editor_toolbar_tools = ?').run(JSON.stringify(['bold', 'italic']))
    runMigrations(db, DIR)
    const row = db.prepare('SELECT editor_toolbar_tools FROM app_settings').get() as any
    expect(JSON.parse(row.editor_toolbar_tools)).toEqual(['bold', 'italic'])
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('non duplica "dialogues" se già presente', () => {
    const { db, tmp } = dbBefore023()
    db.prepare('UPDATE app_settings SET editor_toolbar_tools = ?').run(JSON.stringify(['dialogues', 'blockquote']))
    runMigrations(db, DIR)
    const row = db.prepare('SELECT editor_toolbar_tools FROM app_settings').get() as any
    expect(JSON.parse(row.editor_toolbar_tools)).toEqual(['dialogues', 'blockquote'])
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('i colori dell\'editor (migrazione 022) hanno i default identici al CSS precedente', () => {
    const db = new Database(':memory:')
    runMigrations(db, DIR)
    const row = db.prepare('SELECT editor_bg_light, editor_text_light, editor_bg_dark, editor_text_dark FROM app_settings').get() as any
    expect(row).toEqual({ editor_bg_light: '#f1efe8', editor_text_light: '#374151', editor_bg_dark: '#1f1f22', editor_text_dark: '#e4e4e7' })
  })
})
