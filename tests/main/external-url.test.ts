import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl, isInternalNavigation } from '../../src/main/security/external-url'

describe('isAllowedExternalUrl (v0.4.2)', () => {
  it('ammette http, https e mailto', () => {
    expect(isAllowedExternalUrl('https://example.org/pagina?x=1#a')).toBe(true)
    expect(isAllowedExternalUrl('http://example.org')).toBe(true)
    expect(isAllowedExternalUrl('mailto:autore@example.org')).toBe(true)
    expect(isAllowedExternalUrl('HTTPS://EXAMPLE.ORG')).toBe(true)
  })

  it('rifiuta protocolli che potrebbero avviare altro sul sistema', () => {
    for (const bad of [
      'file:///etc/passwd',
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'data:text/html,<b>x</b>',
      'ftp://example.org/file',
      'vscode://file/etc/passwd',
      'ms-msdt:/id PCWDiagnostic',
      'tel:+390212345',
      'smb://server/share'
    ]) {
      expect(isAllowedExternalUrl(bad), bad).toBe(false)
    }
  })

  it('rifiuta valori che non sono URL assoluti o non sono stringhe', () => {
    for (const bad of ['', '   ', 'esempio.org', '/percorso/relativo', '//example.org', 123, null, undefined, {}, ['https://x.org']]) {
      expect(isAllowedExternalUrl(bad), String(bad)).toBe(false)
    }
  })

  it('rifiuta URL spropositati', () => {
    expect(isAllowedExternalUrl('https://example.org/' + 'a'.repeat(5000))).toBe(false)
  })
})

describe('isInternalNavigation (v0.4.2)', () => {
  const indexFileUrl = 'file:///opt/MyBook/resources/app/out/renderer/index.html'

  it('produzione: ricarica e cambio di hash del router sono navigazioni interne', () => {
    expect(isInternalNavigation(indexFileUrl, { indexFileUrl })).toBe(true)
    expect(isInternalNavigation(indexFileUrl + '#/statistiche', { indexFileUrl })).toBe(true)
    expect(isInternalNavigation(indexFileUrl + '?x=1#/', { indexFileUrl })).toBe(true)
  })

  it('produzione: qualsiasi altro file locale o pagina web NON è interno', () => {
    expect(isInternalNavigation('file:///etc/passwd', { indexFileUrl })).toBe(false)
    expect(isInternalNavigation('file:///opt/MyBook/resources/app/out/renderer/altra.html', { indexFileUrl })).toBe(false)
    expect(isInternalNavigation('https://example.org/', { indexFileUrl })).toBe(false)
    expect(isInternalNavigation('http://localhost:5173/', { indexFileUrl })).toBe(false) // senza dev server dichiarato
  })

  it('sviluppo: ammessa solo l\'origine del dev server', () => {
    const app = { indexFileUrl, devServerUrl: 'http://localhost:5173/' }
    expect(isInternalNavigation('http://localhost:5173/', app)).toBe(true)
    expect(isInternalNavigation('http://localhost:5173/#/progetti', app)).toBe(true)
    expect(isInternalNavigation('http://localhost:5174/', app)).toBe(false) // altra porta = altra origine
    expect(isInternalNavigation('http://localhost.evil.test:5173/', app)).toBe(false)
    expect(isInternalNavigation('https://example.org/', app)).toBe(false)
  })

  it('URL non valido → non interno (nel dubbio si blocca)', () => {
    expect(isInternalNavigation('non è un url', { indexFileUrl })).toBe(false)
    expect(isInternalNavigation('', { indexFileUrl })).toBe(false)
  })

  it('devServerUrl malformato non fa crollare il controllo del file', () => {
    expect(isInternalNavigation(indexFileUrl, { indexFileUrl, devServerUrl: '::::' })).toBe(true)
  })
})
