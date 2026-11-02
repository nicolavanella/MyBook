/**
 * MyBook — quando mostrare le finestre "To Do", recap e scelta del backup (v0.4.1).
 *
 * Le regole stanno qui, come funzioni pure, e non sparse nei componenti:
 * sono poche ma si intrecciano (registro attività acceso/spento, "Non
 * mostrare più", cartella di backup già scelta o già proposta) e sbagliarle
 * significa o infastidire l'utente o non proteggere il suo lavoro.
 *
 * I valori booleani delle impostazioni arrivano dal database come 0/1 e, per
 * installazioni molto vecchie, possono mancare: ogni funzione dichiara cosa
 * significa "mancante".
 */
import type { BackupFrequency } from './schemas/settings.schema'

export interface PromptFlagSettings {
  activity_log_enabled?: number | boolean | null
  todo_recap_enabled?: number | boolean | null
  backup_folder?: string | null
  backup_prompt_shown?: number | boolean | null
  backup_frequency?: string | null
}

/** "Mancante" = comportamento storico: acceso. Solo un esplicito 0/false spegne. */
const isOn = (value: number | boolean | null | undefined): boolean => !(value === 0 || value === false)

/**
 * Il To Do alla chiusura di un progetto e il recap all'apertura compaiono solo se il registro
 * attività è acceso E l'utente non ha scelto "Non mostrare più". Sono due condizioni distinte:
 * il registro può continuare a registrare senza mostrare alcuna finestra.
 */
export function shouldShowTodoPrompt(settings: PromptFlagSettings | null | undefined): boolean {
  if (!settings) return false
  return isOn(settings.activity_log_enabled) && isOn(settings.todo_recap_enabled)
}

/** Stessa regola del To Do: i due si accendono e si spengono insieme (un solo flag per entrambi). */
export const shouldShowRecap = shouldShowTodoPrompt

/**
 * La richiesta "scegli la cartella di backup" compare UNA volta: solo se non c'è ancora una cartella
 * e la richiesta non è già stata mostrata in passato. Senza impostazioni caricate, non si mostra.
 */
export function shouldShowBackupPrompt(settings: PromptFlagSettings | null | undefined): boolean {
  if (!settings) return false
  const hasFolder = typeof settings.backup_folder === 'string' && settings.backup_folder.trim() !== ''
  const alreadyShown = settings.backup_prompt_shown === 1 || settings.backup_prompt_shown === true
  return !hasFolder && !alreadyShown
}

/**
 * Scegliendo la cartella nella richiesta iniziale l'utente vuole che i backup partano: se la
 * frequenza era "Disattivato" diventa "Alla chiusura dell'app" (il default delle nuove
 * installazioni); qualunque altra scelta già fatta si rispetta.
 */
export function backupFrequencyAfterFolderChosen(current: string | null | undefined): BackupFrequency {
  const known: BackupFrequency[] = ['onClose', '30min', '60min', '120min', '240min']
  return known.includes(current as BackupFrequency) ? (current as BackupFrequency) : 'onClose'
}
