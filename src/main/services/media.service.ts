import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuid } from 'uuid'

const MEDIA_SUBDIR = 'MyBook/media'

function mediaDir(): string {
  const dir = path.join(app.getPath('userData'), MEDIA_SUBDIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export class MediaService {
  /** Copia il file scelto dall'utente nella cartella media dell'app e ne restituisce il nuovo percorso assoluto. */
  importImage(sourcePath: string): string {
    const ext = path.extname(sourcePath).toLowerCase()
    const destPath = path.join(mediaDir(), `${uuid()}${ext}`)
    fs.copyFileSync(sourcePath, destPath)
    return destPath
  }

  /**
   * Legge un'immagine dal disco e la restituisce come data: URI. Il renderer
   * non può accedere al filesystem né a file:// (contextIsolation +
   * CSP default-src 'self'): questo è il modo più semplice per mostrarla
   * comunque, senza dover registrare un protocollo custom.
   */
  readAsDataUrl(imagePath: string): string | null {
    if (!imagePath || !fs.existsSync(imagePath)) return null
    const ext = path.extname(imagePath).toLowerCase()
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
    const base64 = fs.readFileSync(imagePath).toString('base64')
    return `data:${mime};base64,${base64}`
  }
}
