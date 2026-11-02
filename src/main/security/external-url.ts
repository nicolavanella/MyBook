/**
 * Regole uniche per i link che escono dall'applicazione (v0.4.2).
 *
 * Prima della 0.4.2 c'erano due comportamenti diversi: il canale IPC
 * `app.openExternal` filtrava il protocollo, mentre `setWindowOpenHandler`
 * (finestre aperte dal contenuto) passava QUALSIASI url a `shell.openExternal`,
 * che su un sistema operativo può avviare applicazioni (file:, schemi
 * registrati da altre app...). Ora entrambi i punti, più il blocco della
 * navigazione, usano queste funzioni.
 *
 * Modulo puro (nessuna dipendenza da Electron): verificabile con i test.
 */

/**
 * Protocolli che possono uscire dall'app verso il sistema: pagine web e
 * client di posta. `tel:` e il resto restano esclusi (l'editor li accetta
 * come testo del link, ma non li lancia da qui).
 */
export const ALLOWED_EXTERNAL_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:']

/** true se `url` è una stringa URL assoluta con un protocollo consentito. */
export function isAllowedExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 4096) return false
  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.includes(new URL(url).protocol)
  } catch {
    return false // non è un URL assoluto valido
  }
}

export interface AppLocation {
  /** URL del dev server (ELECTRON_RENDERER_URL), solo in sviluppo. */
  devServerUrl?: string
  /** URL file:// della pagina index.html dell'app in produzione. */
  indexFileUrl: string
}

/**
 * true se `targetUrl` è una navigazione INTERNA dell'app (ricarica, cambio
 * di hash del router) e va lasciata procedere. Tutto il resto (un link che
 * navigherebbe la finestra verso un sito, un file locale...) va bloccato:
 * la finestra dell'app non deve mai diventare un browser.
 */
export function isInternalNavigation(targetUrl: string, app: AppLocation): boolean {
  let target: URL
  try {
    target = new URL(targetUrl)
  } catch {
    return false
  }
  if (app.devServerUrl) {
    try {
      if (target.origin === new URL(app.devServerUrl).origin) return true
    } catch {
      /* devServerUrl non valido: si prosegue con il controllo del file */
    }
  }
  if (target.protocol !== 'file:') return false
  // Stessa pagina dell'app, ignorando #hash (HashRouter) e ?query.
  target.hash = ''
  target.search = ''
  return target.href === app.indexFileUrl
}
