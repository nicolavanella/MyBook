import { describe, it, expect } from 'vitest'
import { isTruncated, titleIfTruncated } from '@renderer/lib/truncationTitle'

function fakeElement(scrollWidth: number, clientWidth: number) {
  const attrs: Record<string, string> = {}
  return {
    scrollWidth,
    clientWidth,
    attrs,
    setAttribute: (n: string, v: string) => void (attrs[n] = v),
    removeAttribute: (n: string) => void delete attrs[n]
  }
}

describe('titleIfTruncated', () => {
  it('rileva il troncamento quando il contenuto è più largo dello spazio', () => {
    expect(isTruncated({ scrollWidth: 300, clientWidth: 200 })).toBe(true)
    expect(isTruncated({ scrollWidth: 200, clientWidth: 200 })).toBe(false)
  })
  it('imposta il title col nome completo se troncato', () => {
    const el = fakeElement(300, 200)
    titleIfTruncated(el, 'Un nome di scena molto lungo')
    expect(el.attrs.title).toBe('Un nome di scena molto lungo')
  })
  it('rimuove il title se il nome è visibile per intero (anche se prima era troncato)', () => {
    const el = fakeElement(100, 200)
    el.attrs.title = 'vecchio'
    titleIfTruncated(el, 'Breve')
    expect(el.attrs.title).toBeUndefined()
  })
})
