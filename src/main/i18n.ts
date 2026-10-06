/**
 * MyBook — traduzione nel processo main (v0.4.0).
 *
 * Il main mostra testo all'utente in pochi punti (menu contestuale nativo
 * dell'editor, filtri dei dialoghi di file, esiti di backup/ripristino,
 * nomi predefiniti come "(copia)"). La lingua è quella scelta in Impostazioni
 * e viene letta AL MOMENTO dell'uso, quindi un cambio lingua vale subito
 * anche per il menu nativo, senza riavviare l'app.
 *
 * Il main non importa il repository delle impostazioni: `index.ts`
 * registra un "fornitore" della lingua appena il database è pronto. Nei test
 * (e finché il fornitore non è registrato) la lingua è l'italiano, cioè il
 * comportamento precedente alla 0.4.0.
 */
import { DEFAULT_LANGUAGE, createTranslator, normalizeLanguage, type Language, type Translator } from '@shared/i18n'

let languageProvider: () => unknown = () => DEFAULT_LANGUAGE

/** Registrata da index.ts: `() => settingsRepo.get()?.language`. */
export function setLanguageProvider(provider: () => unknown): void {
  languageProvider = provider
}

export function getMainLanguage(): Language {
  try {
    return normalizeLanguage(languageProvider())
  } catch {
    return DEFAULT_LANGUAGE // database non pronto/chiuso: meglio l'italiano che un errore nel mostrare un menu
  }
}

/** Traduce nella lingua corrente delle impostazioni. */
export const tm: Translator = (key, params) => createTranslator(getMainLanguage())(key, params)
