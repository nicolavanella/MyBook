/**
 * MyBook — motore di localizzazione condiviso (v0.4.0).
 *
 * Vive in `shared/` perché lo usano sia il renderer (React) sia il processo
 * main (menu contestuale nativo, dialoghi, messaggi d'errore, export): una
 * sola fonte dei testi, nessuna duplicazione fra i due processi.
 *
 * Scelte (vedi CHANGELOG 0.4.0):
 *  - nessuna libreria esterna: servono solo due lingue, interpolazione di
 *    segnaposto e plurali "uno/altro", cioè poche decine di righe;
 *  - l'italiano è la lingua di riferimento: il tipo `TranslationKey` deriva
 *    da `it.ts`, e `en.ts` è tipizzato in modo da NON compilare se manca
 *    anche una sola chiave;
 *  - una chiave assente a runtime ricade sull'italiano e, in ultima istanza,
 *    sulla chiave stessa: mai una stringa vuota in interfaccia.
 */
import { it } from './it'
import { en } from './en'

/** Lingue supportate dall'interfaccia (e, dalla 0.4.0, dal "Lingua del libro" di ogni progetto). */
export type Language = 'it' | 'en'
export const LANGUAGES: readonly Language[] = ['it', 'en']
export const DEFAULT_LANGUAGE: Language = 'it'

/** Lingua in cui è scritto un libro: determina stopword dell'analisi, etichette e metadati dell'export. */
export type BookLanguage = Language

export type TranslationKey = keyof typeof it

/**
 * Chiavi "plurali": per ogni coppia `base_one` / `base_other` si può chiamare
 * `t('base', { count })` e il motore sceglie la forma giusta per la lingua.
 */
type PluralBase<K> = K extends `${infer B}_other` ? B : never
export type MessageKey = TranslationKey | PluralBase<TranslationKey>

export type TranslationParams = Record<string, string | number>

export const translations: Record<Language, Record<TranslationKey, string>> = { it, en }

/** Qualunque valore sconosciuto (impostazioni corrotte, localStorage vuoto) diventa una lingua valida. */
export function normalizeLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : 'it'
}

/** Sostituisce i segnaposto `{nome}`; un segnaposto senza valore resta visibile (meglio di sparire in silenzio). */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  )
}

/** Forma plurale ("one" | "other" | ...) secondo le regole della lingua: in italiano 0 → "other", 1 → "one". */
function pluralCategory(language: Language, count: number): string {
  try {
    return new Intl.PluralRules(language).select(count)
  } catch {
    return count === 1 ? 'one' : 'other'
  }
}

/**
 * Traduce `key` nella lingua richiesta.
 * Se `params.count` è un numero ed esistono le chiavi `${key}_one`/`${key}_other`,
 * sceglie la forma plurale corretta.
 */
export function translate(language: Language, key: MessageKey, params?: TranslationParams): string {
  const dict = translations[language] as Record<string, string>
  const fallback = translations.it as Record<string, string>
  let resolved = key as string

  if (params && typeof params.count === 'number' && `${key}_other` in fallback) {
    const category = pluralCategory(language, params.count)
    // Se la lingua non ha la categoria specifica (es. "many" in italiano per 1.000.000), vale "other".
    resolved = `${key}_${category}` in dict ? `${key}_${category}` : `${key}_other`
  }

  const template = dict[resolved] ?? fallback[resolved] ?? (key as string)
  return interpolate(template, params)
}

/** Funzione di traduzione legata a una lingua: `const t = createTranslator('en')`. */
export type Translator = (key: MessageKey, params?: TranslationParams) => string
export function createTranslator(language: Language): Translator {
  return (key, params) => translate(language, key, params)
}

/**
 * Lingua iniziale alla PRIMISSIMA installazione, dalla lingua del sistema operativo
 * (es. "it-IT", "en-US", "fr"): italiano se il sistema è italiano, inglese in tutti gli altri casi.
 * Dopo la prima installazione conta solo la scelta fatta in Impostazioni.
 */
export function pickInitialLanguage(systemLocale: string | undefined | null): Language {
  return typeof systemLocale === 'string' && systemLocale.toLowerCase().startsWith('it') ? 'it' : 'en'
}

/** Locale BCP-47 per Intl/toLocale*: date e numeri seguono la lingua dell'interfaccia. */
export function localeOf(language: Language): string {
  return language === 'en' ? 'en-GB' : 'it-IT'
}
