import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isPathInside } from '../../src/main/security/path-guard'

let root: string
let base: string
let outside: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mybook-pathguard-'))
  base = path.join(root, 'media')
  outside = path.join(root, 'altro')
  fs.mkdirSync(base)
  fs.mkdirSync(outside)
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('isPathInside (v0.4.2)', () => {
  it('un file dentro la cartella (anche annidato) è dentro', () => {
    fs.writeFileSync(path.join(base, 'a.png'), 'x')
    fs.mkdirSync(path.join(base, 'sub'))
    fs.writeFileSync(path.join(base, 'sub', 'b.png'), 'x')
    expect(isPathInside(base, path.join(base, 'a.png'))).toBe(true)
    expect(isPathInside(base, path.join(base, 'sub', 'b.png'))).toBe(true)
  })

  it('un file fuori dalla cartella non è dentro', () => {
    fs.writeFileSync(path.join(outside, 'segreto.png'), 'x')
    expect(isPathInside(base, path.join(outside, 'segreto.png'))).toBe(false)
  })

  it('la sequenza ".." non permette di uscire', () => {
    fs.writeFileSync(path.join(outside, 'segreto.png'), 'x')
    expect(isPathInside(base, path.join(base, '..', 'altro', 'segreto.png'))).toBe(false)
  })

  it('una cartella "sorella" con lo stesso prefisso del nome non conta come dentro', () => {
    const evil = path.join(root, 'media-evil')
    fs.mkdirSync(evil)
    fs.writeFileSync(path.join(evil, 'x.png'), 'x')
    expect(isPathInside(base, path.join(evil, 'x.png'))).toBe(false) // "…/media-evil" inizia con "…/media" come stringa
  })

  it('la cartella stessa non è "dentro" se stessa', () => {
    expect(isPathInside(base, base)).toBe(false)
  })

  it('un collegamento simbolico dentro la cartella che punta fuori non permette di uscire', () => {
    const target = path.join(outside, 'segreto.png')
    fs.writeFileSync(target, 'x')
    const link = path.join(base, 'link.png')
    try {
      fs.symlinkSync(target, link)
    } catch {
      return // su Windows senza privilegi i symlink non si possono creare: il caso non è verificabile qui
    }
    expect(isPathInside(base, link)).toBe(false)
  })

  it('percorsi inesistenti → false (nel dubbio si nega)', () => {
    expect(isPathInside(base, path.join(base, 'non-esiste.png'))).toBe(false)
    expect(isPathInside(path.join(root, 'non-esiste'), base)).toBe(false)
  })
})
