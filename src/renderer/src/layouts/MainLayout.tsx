import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FolderOpen,
  BookOpen,
  Users,
  MapPin,
  Package,
  Clock,
  Network,
  BarChart3,
  Download,
  Info,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Pencil
} from 'lucide-react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import ProjectFormModal, { type ProjectFormValues } from '@renderer/features/projects/ProjectFormModal'
import { useTheme } from '@renderer/hooks/useTheme'
import { useUiScale } from '@renderer/hooks/useUiScale'
import { useTranslation } from '@renderer/i18n/useTranslation'
import type { TranslationKey } from '@shared/i18n'
import { normalizeLanguage } from '@shared/i18n'
import { shouldShowContextMenu } from '@renderer/lib/contextMenuGate'
import { buildWindowTitle } from '@renderer/lib/windowTitle'
import TodoPromptModal from '@renderer/components/TodoPromptModal'
import StartupRecapModal from '@renderer/components/StartupRecapModal'
import BackupSetupModal from '@renderer/components/BackupSetupModal'
import { backupFrequencyAfterFolderChosen, shouldShowBackupPrompt, shouldShowRecap, shouldShowTodoPrompt } from '@shared/promptFlags'
import type { AppSettings } from '@shared/schemas/settings.schema'
import type { ProjectActivityRecap } from '@shared/ipc/channels'

const navItems = [
  { to: '/projects', labelKey: 'nav.projects' as TranslationKey, end: true, icon: FolderOpen, showWhen: 'noProject' as const },
  { to: '/', labelKey: 'nav.manuscript' as TranslationKey, end: true, icon: BookOpen, showWhen: 'hasProject' as const },
  { to: '/characters', labelKey: 'nav.characters' as TranslationKey, icon: Users, showWhen: 'hasProject' as const },
  { to: '/locations', labelKey: 'nav.locations' as TranslationKey, icon: MapPin, showWhen: 'hasProject' as const },
  { to: '/objects', labelKey: 'nav.objects' as TranslationKey, icon: Package, showWhen: 'hasProject' as const },
  { to: '/timeline', labelKey: 'nav.timeline' as TranslationKey, icon: Clock, showWhen: 'hasProject' as const },
  { to: '/mindmap', labelKey: 'nav.mindmap' as TranslationKey, icon: Network, showWhen: 'hasProject' as const },
  { to: '/statistics', labelKey: 'nav.statistics' as TranslationKey, icon: BarChart3, showWhen: 'hasProject' as const },
  { to: '/export', labelKey: 'nav.export' as TranslationKey, icon: Download, showWhen: 'hasProject' as const },
  { to: '/info', labelKey: 'nav.info' as TranslationKey, icon: Info, showWhen: 'always' as const },
  // v0.3.9: prima sempre visibile; ora solo con un progetto aperto (la
  // scheda Log, spostata qui in v0.3.7, mostra comunque lo storico DI un
  // progetto, quindi non ha senso fuori da un progetto aperto).
  { to: '/settings', labelKey: 'nav.settings' as TranslationKey, icon: Settings, showWhen: 'hasProject' as const }
]

/**
 * Esito del prompt "To Do" (v0.4.2): `cancelled` = la persona ha scelto "Annulla" e
 * l'azione che l'aveva fatto comparire (chiudere l'app, uscire dal progetto) NON va eseguita;
 * `todo` = testo da salvare, o null se non c'è nulla da salvare ("Salta" o prompt non mostrato).
 */
interface TodoPromptResult {
  cancelled: boolean
  todo: string | null
}

export default function MainLayout(): JSX.Element {
  useTheme()
  useUiScale()

  /**
   * Sopprime il menu contestuale nativo (e con esso il correttore
   * ortografico, che sulle voci del menu mostra i suoi suggerimenti) fuori
   * dai campi di testo genuini e sulle barre di ricerca — vedi
   * contextMenuGate.ts. `preventDefault()` sull'evento DOM 'contextmenu'
   * impedisce a Chromium di generare l'evento 'context-menu' lato main
   * (src/main/editor-context-menu.ts), quindi lì non serve alcun cambiamento:
   * se l'evento non parte nemmeno, quel menu non può comparire.
   */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!shouldShowContextMenu(e.target as Element | null)) e.preventDefault()
    }
    document.addEventListener('contextmenu', handler, true)
    return () => document.removeEventListener('contextmenu', handler, true)
  }, [])
  const { t } = useTranslation()
  const { activeProjectId, exitProject, loadTree } = useProjectStore()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [project, setProject] = useState<any>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)

  // v0.3.5 — Log: recap all'apertura dell'app (una sola volta per avvio,
  // indipendentemente da quante volte l'utente cambia pagina) e prompt
  // "To Do" alla chiusura di un progetto o dell'intera app.
  const [recap, setRecap] = useState<ProjectActivityRecap[] | null>(null)
  const [todoPrompt, setTodoPrompt] = useState<{ projectId: string; projectTitle: string; initialValue: string; onDone: (result: TodoPromptResult) => void } | null>(null)

  // v0.3.7: il recap compare SOLO all'apertura di un progetto (dall'elenco
  // Progetti, o quando l'app riprende da sola l'ultimo progetto attivo al
  // riavvio — in quel caso questo stesso effect, alla primissima esecuzione,
  // vede già activeProjectId valorizzato ed è comunque "apertura del
  // progetto" a tutti gli effetti). Non compare più un recap generale
  // all'avvio dell'app quando nessun progetto è ancora attivo (comportamento
  // della v0.3.6, rimosso su richiesta).
  // v0.4.1: il recap aspetta il caricamento delle impostazioni (per rispettare "Non mostrare più") e si
  // valuta UNA volta per progetto aperto: cambiare il flag in Impostazioni mentre il progetto è aperto
  // non deve far comparire il recap a sorpresa.
  const recapEvaluatedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!activeProjectId) {
      recapEvaluatedFor.current = null // uscito dal progetto: alla prossima apertura (anche dello stesso progetto) il recap si rivaluta
      return
    }
    if (!settings) return
    if (recapEvaluatedFor.current === activeProjectId) return
    recapEvaluatedFor.current = activeProjectId
    if (!shouldShowRecap(settings)) return
    window.mybook.activityLog.recapForProject(activeProjectId).then((projectRecap: ProjectActivityRecap | null) => {
      if (projectRecap) setRecap([projectRecap])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, settings])

  // v0.4.1 — richiesta della cartella di backup: una sola volta, al primo avvio senza cartella (vedi shared/promptFlags.ts).
  // Si segna come "mostrata" subito, non alla risposta: così non ricompare nemmeno se l'app viene chiusa senza rispondere.
  const [showBackupSetup, setShowBackupSetup] = useState(false)
  const backupPromptHandled = useRef(false)
  useEffect(() => {
    if (!settings || backupPromptHandled.current) return
    backupPromptHandled.current = true
    if (!shouldShowBackupPrompt(settings)) return
    setShowBackupSetup(true)
    void window.mybook.settings.update({ backup_prompt_shown: true })
  }, [settings])

  /** Pubblica le nuove impostazioni a tutta l'app (stesso evento usato da Impostazioni). */
  const broadcastSettings = (next: AppSettings) => window.dispatchEvent(new CustomEvent('mybook-settings-changed', { detail: next }))

  const handleChooseBackupFolder = async (): Promise<boolean> => {
    const folder = await window.mybook.settings.pickBackupFolder()
    if (!folder) return false
    const next = await window.mybook.settings.update({
      backup_folder: folder,
      backup_frequency: backupFrequencyAfterFolderChosen(settings?.backup_frequency)
    })
    broadcastSettings(next)
    setShowBackupSetup(false)
    return true
  }

  /** "Non mostrare più" (finestra "Prima di chiudere"): disattiva To Do e recap; si riattiva da Impostazioni > Log. */
  const disableTodoAndRecap = async () => {
    broadcastSettings(await window.mybook.settings.update({ todo_recap_enabled: false }))
  }

  // v0.3.9: riapre il progetto nella stessa sezione in cui era stato chiuso
  // (Manoscritto, Personaggi, Statistiche...) invece di tornare sempre al
  // Manoscritto — vedi anche useProjectStore.setActiveNode, che salva
  // lastSceneId, e ProjectsPage.tsx, che salva lastRoute prima di aprire un
  // progetto per un'azione con destinazione esplicita (es. "Esporta").
  useEffect(() => {
    if (!activeProjectId) return
    window.mybook.projects.getUiState(activeProjectId).then((state: Record<string, unknown>) => {
      const lastRoute = typeof state.lastRoute === 'string' ? state.lastRoute : null
      const isRestorable = lastRoute && navItems.some((item) => item.to === lastRoute && item.showWhen !== 'noProject')
      navigate(isRestorable ? (lastRoute as string) : '/', { replace: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])

  // v0.3.9: tiene aggiornata la sezione corrente nello stato del progetto,
  // ad ogni cambio pagina, così la prossima apertura la ritrova.
  useEffect(() => {
    if (!activeProjectId) return
    void window.mybook.projects.setUiState(activeProjectId, { lastRoute: location.pathname })
  }, [activeProjectId, location.pathname])


  /**
   * Mostra il prompt "To Do" se un progetto è aperto e il registro attività
   * è abilitato, altrimenti risolve subito senza mostrare nulla — usata sia
   * per l'uscita esplicita dal progetto (pulsante "Esci") sia per la
   * richiesta di chiusura dell'intera finestra (vedi l'effect più sotto).
   */
  const promptTodoIfNeeded = (): Promise<TodoPromptResult> => {
    if (!activeProjectId || !shouldShowTodoPrompt(settings)) return Promise.resolve({ cancelled: false, todo: null })
    const currentProjectId = activeProjectId
    return window.mybook.activityLog.getTodo(currentProjectId).then(
      (initialValue: string) =>
        new Promise<TodoPromptResult>((resolve) => {
          setTodoPrompt({
            projectId: currentProjectId,
            projectTitle: project?.title ?? '',
            initialValue,
            onDone: (result) => {
              setTodoPrompt(null)
              resolve(result)
            }
          })
        })
    )
  }

  const handleExit = async () => {
    const { cancelled, todo } = await promptTodoIfNeeded()
    if (cancelled) return // v0.4.2: "Annulla" nel prompt → si resta nel progetto
    if (todo !== null) await window.mybook.activityLog.setTodo(activeProjectId as string, todo)
    exitProject()
    navigate('/projects') // esplicito: senza, si resta sulla route corrente
    // (es. Statistiche) che mostrerebbe solo "apri un progetto", non la lista.
  }

  // Chiusura dell'intera finestra/app: il main intercetta il primo tentativo
  // e aspetta questa conferma (vedi src/main/index.ts e quit-coordinator.ts)
  // prima di chiudere davvero, dando tempo al prompt di comparire se serve.
  // v0.4.2: (1) si risponde SUBITO con ackQuit, così il main sa che il renderer
  // c'è e attende la persona senza limite di tempo (prima, dopo 5 secondi la
  // finestra si chiudeva da sola perdendo la nota in scrittura); (2) "Annulla"
  // nel prompt lascia la finestra aperta (cancelQuit).
  useEffect(() => {
    return window.mybook.app.onQuitRequested(() => {
      void window.mybook.app.ackQuit()
      promptTodoIfNeeded()
        .then(({ cancelled, todo }) => {
          if (cancelled) return window.mybook.app.cancelQuit()
          return window.mybook.app.confirmQuit({ projectId: activeProjectId ?? null, todo: todo ?? undefined })
        })
        .catch(() => {
          // Errore imprevisto nel prompt (es. lettura del To Do fallita): meglio chiudere senza
          // salvare la nota che rendere l'app impossibile da chiudere.
          void window.mybook.app.confirmQuit({ projectId: null })
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, project, settings])

  // Titolo della finestra: "MyBook - nome progetto - sezione attuale".
  // Electron sincronizza automaticamente document.title con il titolo nativo
  // della finestra (nessuna chiamata IPC necessaria — vedi src/main/index.ts).
  // "sezione attuale" è ricavata dalla voce di navigazione la cui rotta
  // corrisponde al path corrente; se non c'è un progetto attivo la parte
  // centrale viene semplicemente omessa.
  //
  // v0.3.4: nel Manoscritto, se c'è una scena in editing, il titolo diventa
  // "MyBook - <Progetto> - Manoscritto - <Capitolo> / <Scena>". I due titoli
  // sono letti con selettori che restituiscono stringhe: l'effetto riparte
  // solo quando cambiano davvero (es. rinomina della scena), non a ogni
  // salvataggio del contenuto.
  const isManuscriptRoute = location.pathname === '/'
  const sceneTitle = useProjectStore((s) => (isManuscriptRoute ? s.tree.find((n) => n.id === s.activeNodeId)?.title ?? '' : ''))
  const chapterTitle = useProjectStore((s) => {
    if (!isManuscriptRoute) return ''
    const node = s.tree.find((n) => n.id === s.activeNodeId)
    const parent = node?.parent_id ? s.tree.find((n) => n.id === node.parent_id) : undefined
    // Solo un vero capitolo: un gruppo non è il "capitolo" della scena.
    return parent?.node_type === 'chapter' ? parent.title : ''
  })

  useEffect(() => {
    const currentItem = navItems.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
    )
    document.title = buildWindowTitle({
      projectTitle: project?.title,
      sectionLabel: currentItem && t(currentItem.labelKey),
      chapterTitle,
      sceneTitle
    })
  }, [location.pathname, project, t, chapterTitle, sceneTitle])

  useEffect(() => {
    window.mybook.settings.get().then(setSettings)
    const handler = (event: Event) => {
      const next = (event as CustomEvent<AppSettings>).detail
      if (next) setSettings(next)
    }
    window.addEventListener('mybook-settings-changed', handler)
    return () => window.removeEventListener('mybook-settings-changed', handler)
  }, [])

  useEffect(() => {
    if (!activeProjectId) {
      setProject(null)
      return
    }
    let cancelled = false
    window.mybook.projects.findById(activeProjectId).then((found) => {
      if (!cancelled && found) setProject(found)
      if (!found && !cancelled) {
        exitProject()
        navigate('/projects', { replace: true })
      }
    }).catch((error) => {
      // Un errore transitorio di IPC non deve essere interpretato come logout.
      console.error('[MainLayout] impossibile verificare il progetto attivo:', error)
    })
    loadTree().catch((error) => {
      console.error('[MainLayout] impossibile caricare l\'albero del progetto:', error)
    })
    return () => { cancelled = true }
  }, [activeProjectId, exitProject, loadTree, navigate])

  const handleEditSubmit = async (values: ProjectFormValues) => {
    if (!activeProjectId) return
    const updated = await window.mybook.projects.update(activeProjectId, {
      title: values.title,
      subtitle: values.subtitle,
      author: values.author || null,
      year: values.year ? Number(values.year) : null,
      description: values.description,
      notes: values.notes,
      plot: values.plot,
      fabula: values.fabula,
      book_language: values.bookLanguage
    })
    setProject(updated)
    setShowEditModal(false)
  }

  return (
    <div className="flex h-full">
      <nav
        className={`flex shrink-0 flex-col border-r border-gray-200 bg-gray-50 transition-all ${
          collapsed ? 'w-14' : 'w-56'
        }`}
      >
        <div className="flex items-center justify-between px-2 pt-3">
          {!collapsed && <div className="px-2 text-lg font-semibold">MyBook</div>}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
            title={collapsed ? t('layout.expand') : t('layout.collapse')}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>

        {/* Titolo progetto attivo, con modifica via icona o click destro */}
        {activeProjectId && project && !collapsed && (
          <div
            className="group relative mx-2 mb-2 mt-2 flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-gray-100"
            onContextMenu={(e) => {
              e.preventDefault()
              setShowContextMenu(true)
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium" title={project.title}>
                {project.title}
              </span>
              {project.subtitle && (
                <span className="block truncate text-xs text-gray-400" title={project.subtitle}>
                  {project.subtitle}
                </span>
              )}
            </span>
            <button
              onClick={() => setShowEditModal(true)}
              className="ml-1 shrink-0 text-gray-300 opacity-0 hover:text-gray-600 group-hover:opacity-100"
              title={t('project.edit')}
            >
              <Pencil size={13} />
            </button>
            {showContextMenu && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowContextMenu(false)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setShowContextMenu(false)
                }}
              >
                <div
                  className="absolute z-50 mt-8 rounded border border-gray-200 bg-white py-1 text-sm shadow-lg"
                  style={{ left: 12 }}
                >
                  <button
                    onClick={() => {
                      setShowEditModal(true)
                      setShowContextMenu(false)
                    }}
                    className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    {t('common.edit')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <ul className="flex-1 space-y-1 px-2">
          {navItems
            .filter((item) => {
              const sidebarVisible =
                item.to === '/characters' ? (settings?.sidebar_visible_tools?.includes('characters') ?? true) :
                item.to === '/locations' ? (settings?.sidebar_visible_tools?.includes('locations') ?? true) :
                item.to === '/objects' ? (settings?.sidebar_visible_tools?.includes('objects') ?? true) :
                item.to === '/timeline' ? (settings?.sidebar_visible_tools?.includes('timeline') ?? true) :
                item.to === '/mindmap' ? (settings?.sidebar_visible_tools?.includes('mindmap') ?? true) :
                item.to === '/statistics' ? (settings?.sidebar_visible_tools?.includes('statistics') ?? true) : true
              if (!sidebarVisible) return false
              return item.showWhen === 'always' ? true : item.showWhen === 'hasProject' ? !!activeProjectId : !activeProjectId
            })
            .map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                      isActive ? 'bg-gray-200 font-medium' : 'hover:bg-gray-100'
                    }`
                  }
                >
                  <item.icon size={16} className="shrink-0" />
                  {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                </NavLink>
              </li>
            ))}
        </ul>

        {activeProjectId && (
          <div className="border-t border-gray-200 p-2">
            <button
              onClick={handleExit}
              title={collapsed ? t('layout.exit') : undefined}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              <LogOut size={16} className="shrink-0" />
              {!collapsed && <span>{t('layout.exit')}</span>}
            </button>
          </div>
        )}
      </nav>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {showEditModal && project && (
        <ProjectFormModal
          title={t('project.edit')}
          submitLabel={t('common.save')}
          initialValues={{
            title: project.title ?? '',
            subtitle: project.subtitle ?? '',
            author: project.author ?? '',
            year: project.year ? String(project.year) : '',
            description: project.description ?? '',
            notes: project.notes ?? '',
            plot: project.plot ?? '',
            fabula: project.fabula ?? '',
            bookLanguage: normalizeLanguage(project.book_language)
          }}
          onClose={() => setShowEditModal(false)}
          onSubmit={handleEditSubmit}
        />
      )}
      {todoPrompt && (
        <TodoPromptModal
          projectTitle={todoPrompt.projectTitle}
          initialValue={todoPrompt.initialValue}
          onSubmit={(text, dontShowAgain) => {
            if (dontShowAgain) void disableTodoAndRecap()
            todoPrompt.onDone({ cancelled: false, todo: text })
          }}
          onSkip={(dontShowAgain) => {
            if (dontShowAgain) void disableTodoAndRecap()
            todoPrompt.onDone({ cancelled: false, todo: null })
          }}
          onCancel={() => todoPrompt.onDone({ cancelled: true, todo: null })}
        />
      )}

      {recap && <StartupRecapModal recap={recap} onClose={() => setRecap(null)} />}
      {showBackupSetup && <BackupSetupModal onChoose={handleChooseBackupFolder} onLater={() => setShowBackupSetup(false)} />}
    </div>
  )
}
