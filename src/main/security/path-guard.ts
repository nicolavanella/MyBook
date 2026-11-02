import fs from 'node:fs'
import path from 'node:path'

/**
 * true se `candidate` è un file/cartella ESISTENTE contenuto in `baseDir`
 * (a qualunque profondità), dopo aver risolto i collegamenti simbolici e le
 * sequenze "..". Se uno dei due percorsi non esiste o non è leggibile
 * ritorna false: nel dubbio si nega.
 *
 * Serve a impedire che un percorso fornito dal renderer (o letto da un
 * pacchetto importato) faccia leggere file qualsiasi dell'utente: la
 * semplice verifica del prefisso della stringa non basta, perché
 * "/media/../../etc/passwd" o un symlink la supererebbero.
 */
export function isPathInside(baseDir: string, candidate: string): boolean {
  try {
    const base = fs.realpathSync(baseDir)
    const target = fs.realpathSync(candidate)
    const relative = path.relative(base, target)
    return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
  } catch {
    return false
  }
}
