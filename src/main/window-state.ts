import { app, screen } from 'electron'
import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
  isFullScreen: boolean
}

const DEFAULT_STATE: WindowState = { width: 1280, height: 800, isMaximized: false, isFullScreen: false }

function statePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

/** Se la posizione salvata non ricade più in nessun monitor collegato (es. secondo schermo scollegato), la scarta invece di aprire la finestra fuori dallo schermo visibile. */
function isOnScreen(x: number, y: number, width: number, height: number): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y
  })
}

export function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(statePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    const state: WindowState = { ...DEFAULT_STATE, ...parsed }
    if (state.x !== undefined && state.y !== undefined && !isOnScreen(state.x, state.y, state.width, state.height)) {
      delete state.x
      delete state.y
    }
    return state
  } catch {
    return DEFAULT_STATE
  }
}

/**
 * Chiamata su 'close' (non 'closed': a quel punto la finestra è già
 * distrutta e le sue dimensioni non sono più leggibili). Usa
 * `getNormalBounds()` invece di `getBounds()` per salvare sempre le
 * dimensioni "a finestra normale", anche se l'utente chiude l'app mentre è
 * massimizzata o a schermo intero — altrimenti al riavvio la finestra
 * "normale" avrebbe le dimensioni abnormi dello stato massimizzato.
 */
export function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen()
    }
    fs.writeFileSync(statePath(), JSON.stringify(state))
  } catch (err) {
    console.warn('[window-state] impossibile salvare lo stato della finestra:', (err as Error).message)
  }
}
