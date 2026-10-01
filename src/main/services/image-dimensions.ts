/**
 * Decodifica dei data: URL immagine e lettura delle dimensioni pixel dai
 * bytes grezzi (PNG/JPEG), senza dipendere da Electron (`nativeImage`) né da
 * librerie esterne. Tenerla separata da export.service.ts permette di
 * testare questa logica con Vitest in ambiente Node puro, senza dover
 * avviare Electron (vedi tests/services/image-dimensions.test.ts).
 *
 * Le immagini nei documenti provengono sempre da MediaService.readAsDataUrl
 * (main/services/media.service.ts), quindi il formato è sempre un data: URL
 * valido — ma la decodifica resta difensiva per non far fallire l'intero
 * export in caso di contenuto corrotto o di un formato che non sappiamo
 * misurare (es. WebP, per cui usiamo dimensioni di fallback ragionevoli).
 */

export type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp'

export interface DecodedImage {
  buffer: Buffer
  mime: string
  /** Tipo compatibile con docx's ImageRun; 'jpg' è usato anche come fallback generico. */
  docxType: DocxImageType
  width: number
  height: number
}

/** Dimensioni usate quando il formato non è riconosciuto (es. WebP) e le dimensioni reali non sono ricavabili. */
const FALLBACK_WIDTH = 480
const FALLBACK_HEIGHT = 320

/** Larghezza massima (px) a cui le immagini vengono scalate nel DOCX, per non sforare il margine di pagina. */
export const DOCX_MAX_IMAGE_WIDTH = 420

function parsePngSize(buf: Buffer): { width: number; height: number } | null {
  // Firma PNG: 8 byte fissi, seguiti dal chunk IHDR (width/height a 32 bit big-endian).
  if (buf.length < 24) return null
  const signature = buf.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function parseJpegSize(buf: Buffer): { width: number; height: number } | null {
  // JPEG: sequenza di segmenti marker (0xFF, tipo). Le dimensioni sono nel
  // segmento SOF0/SOF2 (0xC0/0xC2); saltiamo gli altri leggendo la loro lunghezza dichiarata.
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buf[offset + 1]
    const isSof = marker === 0xc0 || marker === 0xc2
    if (isSof) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
    }
    const segmentLength = buf.readUInt16BE(offset + 2)
    if (segmentLength < 2) return null // segmento malformato: evitiamo un loop infinito
    offset += 2 + segmentLength
  }
  return null
}

function docxTypeFromMime(mime: string): DocxImageType {
  if (mime.includes('png')) return 'png'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('bmp')) return 'bmp'
  return 'jpg' // fallback anche per webp: docx non lo supporta nativamente, ma il buffer JPEG-like spesso decodifica comunque nei viewer moderni
}

/** Decodifica un data: URL (es. "data:image/png;base64,...") in bytes grezzi + dimensioni, o null se il formato non è valido. */
export function dataUrlToImage(dataUrl: string | undefined): DecodedImage | null {
  if (!dataUrl) return null
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  const [, mime, base64] = match
  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return null
  }
  if (buffer.length === 0) return null

  const size = parsePngSize(buffer) ?? parseJpegSize(buffer) ?? { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT }
  return { buffer, mime, docxType: docxTypeFromMime(mime), width: size.width, height: size.height }
}

/** Dimensioni (width/height in px) scalate proporzionalmente entro maxWidth, senza mai ingrandire. */
export function scaleToMaxWidth(
  width: number,
  height: number,
  maxWidth: number = DOCX_MAX_IMAGE_WIDTH
): { width: number; height: number } {
  if (width <= maxWidth) return { width, height }
  const scale = maxWidth / width
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
