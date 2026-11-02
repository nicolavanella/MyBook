import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ProjectTransferService } from '../../src/main/services/project-transfer.service'

const ROOT = path.join(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf-8')
const version = (JSON.parse(read('package.json')) as { version: string }).version

/**
 * La versione compare in più punti scritta a mano (pacchetto di esportazione,
 * changelog, lockfile): in passato si sono disallineati. Questi test fanno
 * fallire la suite se se ne dimentica uno nel preparare una nuova versione.
 */
describe('coerenza della versione', () => {
  it('il pacchetto di esportazione dichiara la versione di package.json', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, path.join(ROOT, 'database/migrations'))
    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'X')
    const pack = new ProjectTransferService(db).exportProject('p')
    expect(pack.application.version).toBe(version)
  })

  it('la prima voce del CHANGELOG è la versione corrente', () => {
    const firstHeading = read('CHANGELOG.md').match(/^## (\S+)/m)?.[1]
    expect(firstHeading).toBe(version)
  })

  it('package-lock.json è allineato a package.json', () => {
    const lock = JSON.parse(read('package-lock.json'))
    expect(lock.version).toBe(version)
    expect(lock.packages[''].version).toBe(version)
  })
})
