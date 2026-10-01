import { describe, it, expect } from 'vitest'
import { dataUrlToImage, scaleToMaxWidth, DOCX_MAX_IMAGE_WIDTH } from '@main/services/image-dimensions'
import sampleDataUrls from '../fixtures/sample-data-urls.json'

describe('dataUrlToImage', () => {
  it('legge correttamente larghezza e altezza reali di un PNG (200x100)', () => {
    const decoded = dataUrlToImage(sampleDataUrls.png)
    expect(decoded).not.toBeNull()
    expect(decoded?.width).toBe(200)
    expect(decoded?.height).toBe(100)
    expect(decoded?.docxType).toBe('png')
  })

  it('legge correttamente larghezza e altezza reali di un JPEG (200x100)', () => {
    const decoded = dataUrlToImage(sampleDataUrls.jpg)
    expect(decoded).not.toBeNull()
    expect(decoded?.width).toBe(200)
    expect(decoded?.height).toBe(100)
    expect(decoded?.docxType).toBe('jpg')
  })

  it('ritorna null per input undefined', () => {
    expect(dataUrlToImage(undefined)).toBeNull()
  })

  it('ritorna null per una stringa che non è un data URL valido', () => {
    expect(dataUrlToImage('non-un-data-url')).toBeNull()
  })

  it('usa dimensioni di fallback per un formato non riconosciuto, senza lanciare eccezioni', () => {
    const decoded = dataUrlToImage('data:image/webp;base64,AAAA')
    expect(decoded).not.toBeNull()
    expect(decoded?.width).toBeGreaterThan(0)
    expect(decoded?.height).toBeGreaterThan(0)
  })
})

describe('scaleToMaxWidth', () => {
  it('non modifica dimensioni già entro il limite massimo', () => {
    expect(scaleToMaxWidth(300, 150)).toEqual({ width: 300, height: 150 })
  })

  it('scala proporzionalmente mantenendo l\'aspect ratio quando eccede il limite', () => {
    const { width, height } = scaleToMaxWidth(1000, 500)
    expect(width).toBe(DOCX_MAX_IMAGE_WIDTH)
    expect(height).toBe(Math.round(500 * (DOCX_MAX_IMAGE_WIDTH / 1000)))
  })

  it('non ingrandisce mai un\'immagine più piccola del limite', () => {
    const { width, height } = scaleToMaxWidth(50, 25, 420)
    expect(width).toBe(50)
    expect(height).toBe(25)
  })
})
