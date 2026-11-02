import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MediaService, MAX_IMAGE_BYTES } from '../../src/main/services/media.service'
import { tm } from '../../src/main/i18n'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

// 1x1 PNG valido: i contenuti non vengono decodificati, ma è utile avere byte riconoscibili.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')

let root: string
let mediaDir: string
let outsideDir: string
let service: MediaService

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mybook-media-'))
  mediaDir = path.join(root, 'media')
  outsideDir = path.join(root, 'altro')
  fs.mkdirSync(mediaDir)
  fs.mkdirSync(outsideDir)
  service = new MediaService(() => mediaDir)
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('MediaService.importImage (v0.4.2)', () => {
  it('copia un\'immagine valida nella cartella media con un nome nuovo e la stessa estensione', () => {
    const source = path.join(outsideDir, 'copertina.PNG')
    fs.writeFileSync(source, PNG)
    const dest = service.importImage(source)
    expect(path.dirname(dest)).toBe(mediaDir)
    expect(path.extname(dest)).toBe('.png')
    expect(path.basename(dest)).not.toContain('copertina')
    expect(fs.readFileSync(dest).equals(PNG)).toBe(true)
    expect(fs.existsSync(source)).toBe(true) // l'originale non si tocca
  })

  it('accetta tutte le estensioni dichiarate', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
      const source = path.join(outsideDir, `img.${ext}`)
      fs.writeFileSync(source, PNG)
      expect(() => service.importImage(source), ext).not.toThrow()
    }
  })

  it('rifiuta file che non sono immagini, qualunque sia il contenuto', () => {
    for (const name of ['note.txt', 'programma.exe', 'archivio.zip', 'senza-estensione', 'finta.png.exe']) {
      const source = path.join(outsideDir, name)
      fs.writeFileSync(source, PNG)
      expect(() => service.importImage(source), name).toThrow(tm('media.unsupportedType'))
    }
    expect(fs.readdirSync(mediaDir)).toEqual([]) // niente copiato
  })

  it('rifiuta una cartella con estensione da immagine', () => {
    const dir = path.join(outsideDir, 'finta.png')
    fs.mkdirSync(dir)
    expect(() => service.importImage(dir)).toThrow(tm('media.unsupportedType'))
  })

  it('rifiuta immagini oltre il limite di dimensione', () => {
    const big = path.join(outsideDir, 'enorme.png')
    fs.writeFileSync(big, Buffer.alloc(MAX_IMAGE_BYTES + 1))
    expect(() => service.importImage(big)).toThrow(tm('media.tooLarge', { maxMb: 25 }))
    expect(fs.readdirSync(mediaDir)).toEqual([])
  })
})

describe('MediaService.readAsDataUrl — sicurezza (v0.4.2)', () => {
  it('legge un\'immagine dentro la cartella media e ne ricostruisce il data URI', () => {
    const file = path.join(mediaDir, 'a.png')
    fs.writeFileSync(file, PNG)
    expect(service.readAsDataUrl(file)).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
  })

  it('usa il tipo MIME giusto per estensione', () => {
    const jpg = path.join(mediaDir, 'a.JPG')
    fs.writeFileSync(jpg, PNG)
    expect(service.readAsDataUrl(jpg)?.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('REGRESSIONE: NON restituisce file fuori dalla cartella media, nemmeno con estensione da immagine', () => {
    const outside = path.join(outsideDir, 'altro.png')
    fs.writeFileSync(outside, PNG)
    expect(service.readAsDataUrl(outside)).toBeNull()
  })

  it('REGRESSIONE: la sequenza ".." non permette di uscire dalla cartella media', () => {
    const outside = path.join(outsideDir, 'altro.png')
    fs.writeFileSync(outside, PNG)
    expect(service.readAsDataUrl(path.join(mediaDir, '..', 'altro', 'altro.png'))).toBeNull()
  })

  it('REGRESSIONE: non legge file che non sono immagini, nemmeno se stanno nella cartella media', () => {
    const secret = path.join(mediaDir, 'chiave.txt')
    fs.writeFileSync(secret, 'contenuto riservato')
    expect(service.readAsDataUrl(secret)).toBeNull() // prima: data:application/octet-stream;base64,...
    const noExt = path.join(mediaDir, 'id_rsa')
    fs.writeFileSync(noExt, 'contenuto riservato')
    expect(service.readAsDataUrl(noExt)).toBeNull()
  })

  it('REGRESSIONE: un collegamento simbolico nella cartella media verso un file esterno non viene seguito', () => {
    const target = path.join(outsideDir, 'segreto.png')
    fs.writeFileSync(target, PNG)
    const link = path.join(mediaDir, 'link.png')
    try {
      fs.symlinkSync(target, link)
    } catch {
      return // symlink non creabili (Windows senza privilegi): caso non verificabile qui
    }
    expect(service.readAsDataUrl(link)).toBeNull()
  })

  it('rifiuta immagini oltre il limite di dimensione', () => {
    const big = path.join(mediaDir, 'enorme.png')
    fs.writeFileSync(big, Buffer.alloc(MAX_IMAGE_BYTES + 1))
    expect(service.readAsDataUrl(big)).toBeNull()
  })

  it('file mancante, vuoto, non stringa o cartella → null, senza errori', () => {
    expect(service.readAsDataUrl(path.join(mediaDir, 'non-esiste.png'))).toBeNull()
    expect(service.readAsDataUrl('')).toBeNull()
    expect(service.readAsDataUrl(undefined as any)).toBeNull()
    expect(service.readAsDataUrl(42 as any)).toBeNull()
    const dir = path.join(mediaDir, 'cartella.png')
    fs.mkdirSync(dir)
    expect(service.readAsDataUrl(dir)).toBeNull()
  })

  it('ciclo completo: ciò che importImage copia, readAsDataUrl lo legge', () => {
    const source = path.join(outsideDir, 'foto.jpg')
    fs.writeFileSync(source, PNG)
    const imported = service.importImage(source)
    expect(service.readAsDataUrl(imported)).toContain('base64,')
  })
})
