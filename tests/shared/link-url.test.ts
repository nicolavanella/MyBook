import { describe, expect, it } from 'vitest'
import { normalizeLinkUrl } from '../../src/shared/linkUrl'

describe('normalizeLinkUrl', () => {
  it('vuoto o solo spazi → ok con url vuoto (rimuovi il link)', () => {
    expect(normalizeLinkUrl('')).toEqual({ ok: true, url: '' })
    expect(normalizeLinkUrl('   ')).toEqual({ ok: true, url: '' })
  })

  it('lascia invariati http, https, mailto e tel (anche con maiuscole nello schema)', () => {
    expect(normalizeLinkUrl('https://example.org/a?b=1')).toEqual({ ok: true, url: 'https://example.org/a?b=1' })
    expect(normalizeLinkUrl('http://example.org')).toEqual({ ok: true, url: 'http://example.org' })
    expect(normalizeLinkUrl('mailto:me@example.org')).toEqual({ ok: true, url: 'mailto:me@example.org' })
    expect(normalizeLinkUrl('tel:+390212345')).toEqual({ ok: true, url: 'tel:+390212345' })
    expect(normalizeLinkUrl('HTTPS://EXAMPLE.ORG')).toEqual({ ok: true, url: 'HTTPS://EXAMPLE.ORG' })
  })

  it('senza schema antepone https://', () => {
    expect(normalizeLinkUrl('example.org')).toEqual({ ok: true, url: 'https://example.org' })
    expect(normalizeLinkUrl('  www.example.org/x ')).toEqual({ ok: true, url: 'https://www.example.org/x' })
  })

  it('rifiuta schemi pericolosi o sconosciuti', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://x.org']) {
      expect(normalizeLinkUrl(bad), bad).toEqual({ ok: false })
    }
  })

  it('rifiuta indirizzi con spazi interni', () => {
    expect(normalizeLinkUrl('esempio di testo')).toEqual({ ok: false })
    expect(normalizeLinkUrl('https://a.org/ b')).toEqual({ ok: false })
  })

  it('"host:porta" non è scambiato per uno schema', () => {
    expect(normalizeLinkUrl('localhost:3000/pagina')).toEqual({ ok: true, url: 'https://localhost:3000/pagina' })
  })

  it('solo lo schema, senza altro, non è valido', () => {
    expect(normalizeLinkUrl('https://')).toEqual({ ok: false })
    expect(normalizeLinkUrl('mailto:')).toEqual({ ok: false })
  })
})
