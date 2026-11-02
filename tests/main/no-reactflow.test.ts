import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

/** Tutti i file sorgente (.ts/.tsx) sotto una cartella, ricorsivamente. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

/**
 * Dalla 0.5.0 i grafi usano il motore interno (renderer/lib/graph*.ts +
 * features/mindmap/GraphCanvas.tsx). Questi test impediscono di reintrodurre per
 * distrazione la libreria sostituita.
 */
describe('React Flow non è più una dipendenza (v0.5.0)', () => {
  it('non è dichiarato in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
    const declared = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(Object.keys(declared).filter((name) => /reactflow|@xyflow/i.test(name))).toEqual([])
  })

  it('non è nel package-lock.json', () => {
    const lock = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8')
    expect(lock).not.toMatch(/"node_modules\/(reactflow|@reactflow\/|@xyflow\/)/)
  })

  it('nessun file sorgente lo importa', () => {
    const offenders = sourceFiles(path.join(ROOT, 'src')).filter((file) =>
      /from\s+['"](reactflow|@xyflow\/[^'"]+|reactflow\/[^'"]+)['"]|import\s+['"]reactflow/.test(fs.readFileSync(file, 'utf-8'))
    )
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([])
  })
})
