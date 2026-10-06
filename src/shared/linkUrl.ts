/**
 * Normalizzazione dell'indirizzo di un link inserito dall'utente (v0.4.0).
 *
 * Perché esiste: il campo link usava `window.prompt()`, che Electron non
 * supporta (lancia un errore), quindi lo strumento Link non poteva funzionare
 * nell'app reale. Ora l'indirizzo si inserisce in una finestra dell'app e
 * passa da qui, che oltre a ripulire evita schemi pericolosi (`javascript:`,
 * `data:`…) che finirebbero poi negli export HTML/EPUB.
 *
 *  - vuoto            → ok, url "" (significa: rimuovi il link);
 *  - http/https/mailto/tel → invariato;
 *  - nessuno schema   → si antepone "https://" ("example.org" → "https://example.org");
 *  - altro schema, spazi interni, solo schema → non valido.
 */
export type LinkUrlResult = { ok: true; url: string } | { ok: false }

const ALLOWED_SCHEME = /^(https?:\/\/|mailto:|tel:)\S+$/i
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function normalizeLinkUrl(input: string): LinkUrlResult {
  const value = input.trim()
  if (value === '') return { ok: true, url: '' }
  if (/\s/.test(value)) return { ok: false }
  if (ALLOWED_SCHEME.test(value)) return { ok: true, url: value }
  // "localhost:3000" ha la forma di uno schema ma è host:porta → lo trattiamo come indirizzo senza schema.
  if (ANY_SCHEME.test(value) && !/^[^/:]+:\d+(\/|$)/.test(value)) return { ok: false }
  return { ok: true, url: `https://${value}` }
}
