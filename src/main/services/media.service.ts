import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuid } from 'uuid'
import { isPathInside } from '../security/path-guard'
import { tm } from '../i18n'

const MEDIA_SUBDIR = 'MyBook/media'

/** Tetto alla dimensione di un'immagine (importata o letta): evita di caricare in memoria file enormi per errore o per malizia. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024

/** Cartella media predefinita dell'app (userData/MyBook/media), creata al primo uso. */
function defaultMediaDir(): string {
  const dir = path.join(app.getPath('userData'), MEDIA_SUBDIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Estensioni ammesse → tipo MIME. Fuori da questo elenco un file NON è considerato un'immagine. */
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export class MediaService {
  /**
   * @param mediaDirProvider restituisce la cartella media (creandola se manca).
   *   Iniettabile per i test, che non hanno Electron: di default userData/MyBook/media.
   */
  constructor(private readonly mediaDirProvider: () => string = defaultMediaDir) {}

  /**
   * Copia il file scelto dall'utente nella cartella media dell'app e ne
   * restituisce il nuovo percorso assoluto. Dalla 0.4.2 verifica che sia un
   * file di immagine (estensione ammessa) e non superi MAX_IMAGE_BYTES: il
   * selettore di file già filtra per estensione, ma il controllo non deve
   * dipendere dal chiamante.
   */
  importImage(sourcePath: string): string {
    const ext = path.extname(sourcePath).toLowerCase()
    if (!MIME_BY_EXT[ext]) throw new Error(tm('media.unsupportedType'))
    const stat = fs.statSync(sourcePath)
    if (!stat.isFile()) throw new Error(tm('media.unsupportedType'))
    if (stat.size > MAX_IMAGE_BYTES) throw new Error(tm('media.tooLarge', { maxMb: Math.round(MAX_IMAGE_BYTES / 1024 / 1024) }))
    const destPath = path.join(this.mediaDirProvider(), `${uuid()}${ext}`)
    fs.copyFileSync(sourcePath, destPath)
    return destPath
  }

  /**
   * Legge un'immagine dal disco e la restituisce come data: URI. Il renderer
   * non può accedere al filesystem né a file:// (contextIsolation +
   * CSP default-src 'self'): questo è il modo più semplice per mostrarla
   * comunque, senza dover registrare un protocollo custom.
   *
   * SICUREZZA (v0.4.2). Il percorso arriva dal renderer, e può provenire da
   * un pacchetto di progetto importato: prima di allora qualsiasi file
   * leggibile dall'utente (es. una chiave SSH) poteva essere restituito in
   * base64. Ora si legge SOLO un file di immagine (estensione ammessa, entro
   * il limite di dimensione) che si trova DENTRO la cartella media dell'app;
   * in ogni altro caso si ritorna null, come per un file mancante.
   */
  readAsDataUrl(imagePath: string): string | null {
    if (typeof imagePath !== 'string' || !imagePath) return null
    if (!fs.existsSync(imagePath)) return null
    const mime = MIME_BY_EXT[path.extname(imagePath).toLowerCase()]
    if (!mime) return null
    if (!isPathInside(this.mediaDirProvider(), imagePath)) {
      console.warn('[media] lettura rifiutata: percorso fuori dalla cartella media')
      return null
    }
    const stat = fs.statSync(imagePath)
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return null
    const base64 = fs.readFileSync(imagePath).toString('base64')
    return `data:${mime};base64,${base64}`
  }
}
