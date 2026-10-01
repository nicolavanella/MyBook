import { v4 as uuid } from 'uuid'
import { isSameLocalDay } from '@shared/calendarDate'
import type { ActivityLogRepository } from '../database/repositories/activity-log.repository'
import type { SettingsRepository } from '../database/repositories/settings.repository'
import type { ActivityLogEntry, ProjectActivityRecap } from '@shared/ipc/channels'

const RECAP_PROJECT_LIMIT = 5
const RECAP_ENTRIES_PER_PROJECT = 8

/**
 * Registro attività per progetto (v0.3.5): registra le operazioni
 * principali (creazione/modifica/eliminazione/spostamento) man mano che
 * avvengono, conserva la nota "To Do" lasciata alla chiusura di un progetto,
 * e prepara il recap mostrato all'apertura dell'app.
 *
 * L'interruttore "Registra attività" (Impostazioni) è letto direttamente da
 * `app_settings` ad ogni chiamata (non in cache): è un'operazione economica
 * su SQLite locale, e così un toggle disattivato smette di produrre nuove
 * voci nello stesso istante, senza dover propagare l'evento altrove.
 */
export class ActivityLogService {
  constructor(
    private repo: ActivityLogRepository,
    private settingsRepo: SettingsRepository
  ) {}

  isEnabled(): boolean {
    const settings = this.settingsRepo.get() as { activity_log_enabled?: number } | undefined
    // undefined -> database non ancora migrato/letto: per sicurezza si comporta come abilitato (default della colonna).
    return settings?.activity_log_enabled === undefined || settings.activity_log_enabled !== 0
  }

  /** Registra un'operazione. Non fa nulla se il registro è disabilitato o se manca il progetto (operazioni non legate a un progetto specifico). entityId è opzionale (stringa vuota se omesso) e serve solo a logThrottled per riconoscere la stessa entità tra una chiamata e l'altra. */
  log(
    projectId: string | null | undefined,
    entityType: ActivityLogEntry['entity_type'],
    action: ActivityLogEntry['action'],
    entityName: string,
    details = '',
    entityId = ''
  ): void {
    if (!projectId || !this.isEnabled()) return
    this.repo.insert({
      id: uuid(),
      project_id: projectId,
      entity_type: entityType,
      action,
      entity_name: entityName,
      entity_id: entityId,
      details
    })
  }

  /**
   * Come log(), ma salta la registrazione se per questa stessa entità+azione
   * esiste già una voce nello stesso giorno di calendario (v0.3.8, sostituisce
   * la soglia a tempo della v0.3.7). Usata per la modifica del testo delle
   * scene: il salvataggio automatico può scattare ogni pochi secondi mentre
   * si scrive, e registrare ogni singolo salvataggio sommergerebbe il
   * registro. A differenza di una soglia a tempo fisso (es. "non prima di 5
   * minuti dall'ultima"), qui non c'è nessuna attesa: la primissima modifica
   * della giornata viene registrata subito, poi basta — al più una voce
   * "Modificata" al giorno per scena, non una ogni tot minuti di scrittura
   * continuata. entityId è obbligatorio (senza, non c'è nulla da confrontare).
   */
  logOncePerDay(
    projectId: string | null | undefined,
    entityType: ActivityLogEntry['entity_type'],
    action: ActivityLogEntry['action'],
    entityName: string,
    entityId: string
  ): void {
    if (!projectId || !entityId || !this.isEnabled()) return
    const lastAt = this.repo.mostRecentTimestamp(entityId, action)
    if (lastAt) {
      const last = new Date(lastAt.endsWith('Z') ? lastAt : `${lastAt}Z`)
      if (isSameLocalDay(last, new Date())) return
    }
    this.log(projectId, entityType, action, entityName, '', entityId)
  }

  /** Elenco completo (fino al limite) delle voci di un progetto — v0.3.6, scheda Statistiche > Log. A differenza del recap non tocca il ToDo né l'interruttore "abilitato": la scheda Log è una consultazione esplicita dello storico, non un avviso automatico, quindi resta visibile anche a registrazione disattivata (mostra comunque le voci passate). */
  listForProject(projectId: string, limit = 300): ActivityLogEntry[] {
    return this.repo.recentForProject(projectId, limit)
  }

  getTodo(projectId: string): string {
    return this.repo.getTodo(projectId)
  }

  /** Testo vuoto = nessuna nota lasciata: equivale a "niente da fare la prossima volta" e non comparirà nel recap. */
  setTodo(projectId: string, text: string): void {
    this.repo.setTodo(projectId, text.trim())
  }

  /**
   * Recap di UN SOLO progetto, mostrato all'apertura di quel progetto
   * (v0.3.6) — sia quando l'utente lo apre dall'elenco Progetti, sia quando
   * l'app si riavvia riprendendo automaticamente l'ultimo progetto attivo.
   * Ritorna null se non c'è nulla da mostrare (nessuna voce e nessun ToDo),
   * così il chiamante sa di non dover aprire alcuna finestra di dialogo.
   */
  recapForProject(projectId: string, projectTitle: string): ProjectActivityRecap | null {
    if (!this.isEnabled()) return null
    const todo = this.repo.getTodo(projectId)
    const entries = this.repo.recentForProject(projectId, RECAP_ENTRIES_PER_PROJECT)
    if (!todo && entries.length === 0) return null
    return { projectId, projectTitle, todo, entries }
  }

  /**
   * Recap mostrato all'apertura dell'app: gli ultimi progetti con attività
   * registrata (comprese le sole note ToDo, che sono altrettanto rilevanti
   * da ricordare quanto le operazioni), ciascuno con le sue ultime voci e
   * l'eventuale nota "To Do".
   */
  recap(projectTitleOf: (projectId: string) => string | undefined): ProjectActivityRecap[] {
    if (!this.isEnabled()) return []
    return this.repo
      .recentProjectIds(RECAP_PROJECT_LIMIT)
      .map((projectId) => ({
        projectId,
        projectTitle: projectTitleOf(projectId) ?? '(progetto eliminato)',
        todo: this.repo.getTodo(projectId),
        entries: this.repo.recentForProject(projectId, RECAP_ENTRIES_PER_PROJECT)
      }))
      .filter((recap) => recap.entries.length > 0 || recap.todo)
  }
}
