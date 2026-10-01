import { contextBridge, ipcRenderer } from 'electron'
import { buildApi } from './api'

const invoke = (channel: string, ...args: any[]): Promise<any> => ipcRenderer.invoke(channel, ...args)
/** Sottoscrizione a eventi push dal main (menu contestuale nativo -> "Aggiungi commento"/"Aggiungi tag"). Ritorna una funzione di cleanup per rimuovere il listener. */
const on = (channel: string, listener: (...args: any[]) => void): (() => void) => {
  const wrapped = (_event: unknown, ...args: any[]) => listener(...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}
/**
 * v0.3.8 — invio SINCRONO al main: usato solo per segnalare, al momento del
 * click destro nell'editor, se il punto cliccato è un commento/tag già
 * esistente (editor.reportContextClick). Deve essere sincrono (non invoke,
 * che è asincrono) perché il menu contestuale nativo di Electron si
 * costruisce subito dopo, nello stesso giro di eventi: un invoke asincrono
 * arriverebbe troppo tardi, a menu già mostrato.
 */
const sendSync = (channel: string, ...args: any[]): any => ipcRenderer.sendSync(channel, ...args)

const api = buildApi(invoke, on, sendSync)

// contextIsolation attivo: unico modo sicuro per esporre l'API al renderer.
contextBridge.exposeInMainWorld('mybook', api)
