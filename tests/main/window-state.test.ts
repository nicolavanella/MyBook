import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mybook-window-state-'))

// window-state.ts importa 'electron' per app.getPath e screen.getAllDisplays:
// in ambiente Vitest (Node puro) va mockato, come già fatto altrove per i
// test dei servizi main che transitivamente toccano il pacchetto 'electron'.
vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
  screen: { getAllDisplays: () => mockDisplays }
}))

let mockDisplays: { workArea: { x: number; y: number; width: number; height: number } }[] = [
  { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
]

describe('window-state', () => {
  const filePath = path.join(tmpDir, 'window-state.json')

  beforeEach(() => {
    mockDisplays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
    try {
      fs.unlinkSync(filePath)
    } catch {}
    vi.resetModules()
  })

  afterEach(() => {
    try {
      fs.unlinkSync(filePath)
    } catch {}
  })

  it('ritorna lo stato di default se non esiste ancora alcun file salvato', async () => {
    const { loadWindowState } = await import('../../src/main/window-state')
    expect(loadWindowState()).toEqual({ width: 1280, height: 800, isMaximized: false, isFullScreen: false })
  })

  it('salva e ricarica correttamente dimensione, posizione e stato', async () => {
    const { loadWindowState, saveWindowState } = await import('../../src/main/window-state')
    const fakeWin = {
      getNormalBounds: () => ({ width: 1400, height: 900, x: 100, y: 50 }),
      isMaximized: () => false,
      isFullScreen: () => true
    } as any
    saveWindowState(fakeWin)
    const state = loadWindowState()
    expect(state).toEqual({ width: 1400, height: 900, x: 100, y: 50, isMaximized: false, isFullScreen: true })
  })

  it('scarta x/y se non ricadono più in nessun monitor collegato (es. secondo schermo scollegato)', async () => {
    const { loadWindowState, saveWindowState } = await import('../../src/main/window-state')
    const fakeWin = {
      getNormalBounds: () => ({ width: 1000, height: 700, x: 3000, y: 3000 }), // fuori dall'unico monitor mockato
      isMaximized: () => false,
      isFullScreen: () => false
    } as any
    saveWindowState(fakeWin)
    const state = loadWindowState()
    expect(state.x).toBeUndefined()
    expect(state.y).toBeUndefined()
    expect(state.width).toBe(1000) // dimensioni comunque preservate, solo la posizione viene scartata
  })

  it('non lancia eccezioni se il file salvato è JSON corrotto', async () => {
    fs.writeFileSync(filePath, '{ questo non è json valido')
    const { loadWindowState } = await import('../../src/main/window-state')
    expect(loadWindowState()).toEqual({ width: 1280, height: 800, isMaximized: false, isFullScreen: false })
  })
})
