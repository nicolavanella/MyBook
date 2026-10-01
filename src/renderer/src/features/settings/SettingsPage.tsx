import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@renderer/hooks/useTheme'
import { useConfirm } from '@renderer/components/ConfirmDialog'
import type { AppSettings, BackupFrequency, ToolbarTool } from '@shared/schemas/settings.schema'
import { ALL_TOOLBAR_TOOLS, DEFAULT_TOOLBAR_TOOLS, DEFAULT_EDITOR_COLORS } from '@renderer/hooks/useEditorPreferences'
import { Database, RotateCcw, Trash2, Upload, BookOpen, Users, MapPin, Package, Clock, Network, GripVertical, BarChart3 } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from '@renderer/i18n/useTranslation'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import LogTab from '@renderer/features/statistics/LogTab'

const DICTIONARY_LANGUAGES = ['de-DE', 'en-GB', 'en-US', 'es-ES', 'fr-FR', 'it-IT', 'pt-PT']
const BACKUP_FREQUENCIES: { value: BackupFrequency; label: string }[] = [
  { value: 'off', label: 'Disattivato' },
  { value: 'onClose', label: 'Alla chiusura dell’app' },
  { value: '30min', label: 'Ogni 30 minuti' },
  { value: '60min', label: 'Ogni ora' },
  { value: '120min', label: 'Ogni 2 ore' },
  { value: '240min', label: 'Ogni 4 ore' }
]
const SIDEBAR_TOOLS = [
  { id: 'characters', label: 'Personaggi', icon: Users },
  { id: 'locations', label: 'Località', icon: MapPin },
  { id: 'objects', label: 'Oggetti', icon: Package },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'mindmap', label: 'Mappa concettuale', icon: Network },
  { id: 'statistics', label: 'Statistiche', icon: BarChart3 }
] as const

type Tab = 'general' | 'tools' | 'editor' | 'log' | 'advanced'

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900 ${
        checked ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-700'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }): JSX.Element {
  return <section className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
    {description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>}
    <div className="mt-5">{children}</div>
  </section>
}

function SortableToolRow({ id, label, onToggle }: { id: string; label: string; onToggle: () => void }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
      <button {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500" title="Trascina per riordinare"><GripVertical size={15} /></button>
      <input type="checkbox" checked readOnly onClick={onToggle} className="cursor-pointer" />
      <span className="flex-1">{label}</span>
    </div>
  )
}

export default function SettingsPage(): JSX.Element {
  const { theme, setTheme } = useTheme()
  const { language, t } = useTranslation()
  const confirm = useConfirm()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [dbStatus, setDbStatus] = useState<{ path: string; tables: { name: string; records: number }[] } | null>(null)
  const [dbStatusLoading, setDbStatusLoading] = useState(false)
  // v0.3.6: stato controllato (non il solo <details> nativo) così "Aggiorna" non la richiude più.
  const [tablesExpanded, setTablesExpanded] = useState(false)
  const [hideEmptyTables, setHideEmptyTables] = useState(true) // nascoste di default, come richiesto
  const [activeTab, setActiveTab] = useState<Tab>('general')
  // v0.3.7: la scheda Log mostra lo storico del progetto attualmente aperto (se c'è).
  const { activeProjectId } = useProjectStore()
  const updateQueueRef = useRef(Promise.resolve())
  const toolbarSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loadDbStatus = async () => {
    setDbStatusLoading(true)
    try { setDbStatus(await window.mybook.settings.databaseStatus()) } finally { setDbStatusLoading(false) }
  }

  useEffect(() => { window.mybook.settings.get().then(setSettings) }, [])
  useEffect(() => { if (activeTab === 'advanced') void loadDbStatus() }, [activeTab])

  if (!settings) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Caricamento…</div>

  const update = async (patch: any) => {
    const operation = updateQueueRef.current.then(() => window.mybook.settings.update(patch))
    updateQueueRef.current = operation.then(() => undefined, () => undefined)
    const next = await operation
    setSettings(next)
    window.dispatchEvent(new CustomEvent('mybook-settings-changed', { detail: next }))
  }

  const pickFolder = async () => { const folder = await window.mybook.settings.pickBackupFolder(); if (folder) await update({ backup_folder: folder }) }
  const backupNow = async () => {
    setBackupStatus('In corso…')
    const result = await window.mybook.settings.backupNow()
    setBackupStatus(result.ok ? `Backup salvato: ${result.path}` : `Errore: ${result.reason}`)
  }

  const clearDb = async () => {
    if (!await confirm({ message: 'Svuotare tutti i dati dei progetti? Le impostazioni dell’app verranno mantenute.', confirmLabel: 'Svuota database', danger: true })) return
    await window.mybook.settings.clearDatabase()
    await loadDbStatus()
  }
  const resetDb = async () => {
    if (!await confirm({ message: 'Resettare completamente il database? Tutti i progetti e le impostazioni verranno eliminati.', confirmLabel: 'Reset completo', danger: true })) return
    await window.mybook.settings.resetDatabase()
  }
  const loadBackup = async () => {
    const file = await window.mybook.settings.pickDatabaseBackup()
    if (!file) return
    if (!await confirm({ message: 'Caricare questo database? Il database corrente verrà sostituito e l’app verrà riavviata.', confirmLabel: 'Carica backup', danger: true })) return
    await window.mybook.settings.loadDatabaseBackup(file)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: t('settings.tab.general') }, { id: 'tools', label: t('settings.tab.tools') },
    { id: 'editor', label: t('settings.tab.editor') }, { id: 'log', label: t('settings.tab.log') },
    { id: 'advanced', label: t('settings.tab.advanced') }
  ]

  return <div className="min-h-full p-6">
    <div className="w-full">
      <h1 className="mb-5 text-xl font-semibold text-gray-900 dark:text-gray-100">Impostazioni</h1>
      <div className="mb-6 flex w-full overflow-x-auto rounded border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
        {tabs.map(tab => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
          className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.id
            ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
          {tab.label}
        </button>)}
      </div>

      {activeTab === 'general' && <div className="w-full space-y-4">
        {/* v0.3.6: Aspetto, Dimensione testo e Lingua sulla stessa riga (prima Dimensione testo era una SectionCard a parte, sotto). */}
        <div className="grid gap-4 sm:grid-cols-3">
          <SectionCard title={t('settings.appearance.title')}>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <div><div className="text-sm font-medium text-gray-900 dark:text-gray-100">{theme === 'dark' ? t('settings.appearance.dark') : t('settings.appearance.light')}</div><div className="text-xs text-gray-500 dark:text-gray-400">{theme === 'dark' ? 'Riduce la luminosità.' : 'Interfaccia chiara.'}</div></div>
              <Toggle checked={theme === 'dark'} onChange={v => setTheme(v ? 'dark' : 'light')} label="Attiva tema scuro" />
            </div>
          </SectionCard>
          <SectionCard title="Dimensione testo" description="Si applica a tutta l’interfaccia: sidebar, albero, modali (non l’editor, che si regola in Impostazioni > Editor).">
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => update({ ui_font_size: size })}
                  className={`flex-1 rounded border px-2 py-2 text-xs font-medium sm:text-sm ${
                    (settings.ui_font_size ?? 'medium') === size
                      ? 'border-blue-600 bg-blue-600 text-white dark:bg-blue-600'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {size === 'small' ? 'Piccolo' : size === 'medium' ? 'Medio' : 'Grande'}
                </button>
              ))}
            </div>
          </SectionCard>
          <SectionCard title={t('settings.language.title')} description={t('settings.language.description')}>
            <select
              value={language}
              onChange={e => update({ language: e.target.value as 'it' | 'en' })}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="it">{t('settings.language.it')}</option>
              <option value="en">{t('settings.language.en')}</option>
            </select>
          </SectionCard>
        </div>
        <SectionCard title={t('settings.backup.title')} description={t('settings.backup.description')}>
          <div className="space-y-4">
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Backup automatico</span>
              <select
                value={settings.backup_frequency}
                onChange={e => update({ backup_frequency: e.target.value as BackupFrequency })}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                {BACKUP_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">Numero massimo di backup da conservare</span>
              <input
                type="number"
                min={1}
                max={999}
                value={settings.backup_max_count}
                onChange={e => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n >= 1) update({ backup_max_count: n }) }}
                className="w-28 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">I backup più vecchi oltre questo numero vengono eliminati automaticamente.</span>
            </label>
            <div className="flex gap-2"><input readOnly value={settings.backup_folder || 'Nessuna cartella selezionata'} className="min-w-0 flex-1 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300" /><button onClick={pickFolder} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">Scegli…</button></div>
            <button onClick={backupNow} disabled={!settings.backup_folder} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700">Backup ora</button>
            {backupStatus && <p className="text-xs text-gray-500 dark:text-gray-400">{backupStatus}</p>}
          </div>
        </SectionCard>
      </div>}

      {activeTab === 'tools' && <div className="w-full space-y-4"><SectionCard title="Strumenti sidebar" description="Scegli quali strumenti del progetto devono essere visibili nella sidebar principale.">
        <div className="grid gap-3 sm:grid-cols-2">
          {SIDEBAR_TOOLS.map(tool => { const Icon = tool.icon; const checked = settings.sidebar_visible_tools?.includes(tool.id) ?? true; return <div key={tool.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"><div className="flex items-center gap-3"><Icon size={18} className="text-gray-500 dark:text-gray-400" /><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{tool.label}</span></div><Toggle checked={checked} onChange={v => { const current = settings.sidebar_visible_tools?.length ? settings.sidebar_visible_tools : SIDEBAR_TOOLS.map(x => x.id); const next = v ? [...current, tool.id] : current.filter(id => id !== tool.id); update({ sidebar_visible_tools: Array.from(new Set(next)) }) }} label={`Mostra ${tool.label}`} /></div> })}
        </div>
      </SectionCard></div>}

      {activeTab === 'editor' && <div className="w-full space-y-4">
        <SectionCard title="Testo e sezioni" description="Dimensione del testo nell’editor e quali sezioni mostrare nel pannello della scena.">
          <div className="space-y-5">
            <div><span className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Dimensione testo (editor)</span><div className="flex gap-2">{(['small','medium','large'] as const).map(size => <button key={size} onClick={() => update({ editor_font_size: size })} className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${settings.editor_font_size === size ? 'border-blue-600 bg-blue-600 text-white dark:bg-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'}`}>{size === 'small' ? 'Piccolo' : size === 'medium' ? 'Medio' : 'Grande'}</button>)}</div></div>
            <div className="flex items-center justify-between"><div><div className="text-sm font-medium text-gray-900 dark:text-gray-100">Mostra Tag</div><div className="text-xs text-gray-500 dark:text-gray-400">Tag (Personaggi/Località/Oggetti/Eventi) nel testo, nel menu contestuale e nella sezione dedicata.</div></div><Toggle checked={settings.tags_enabled === undefined ? true : !!settings.tags_enabled} onChange={v => update({ tags_enabled: v })} /></div>
            <div className="flex items-center justify-between"><div><div className="text-sm font-medium text-gray-900 dark:text-gray-100">Mostra Commenti</div><div className="text-xs text-gray-500 dark:text-gray-400">Commenti nel testo, nel menu contestuale e nella sezione dedicata.</div></div><Toggle checked={settings.comments_enabled === undefined ? true : !!settings.comments_enabled} onChange={v => update({ comments_enabled: v })} /></div>
            <div className="flex items-center justify-between"><div><div className="text-sm font-medium text-gray-900 dark:text-gray-100">Mostra Revisioni</div><div className="text-xs text-gray-500 dark:text-gray-400">La sezione Revisioni nel pannello della scena (le revisioni continuano comunque a essere create in background).</div></div><Toggle checked={settings.revisions_enabled === undefined ? true : !!settings.revisions_enabled} onChange={v => update({ revisions_enabled: v })} /></div>
          </div>
        </SectionCard>
        {/*
          v0.3.9: colori dell'editor, separati per tema chiaro e scuro (ciascun tema ha i propri default, gli stessi di prima, ripristinabili con un click). Quello mostrato nell'editor è sempre e solo quello del tema attualmente attivo.
        */}
        <SectionCard title="Colori dell’editor" description="Sfondo e colore del testo dell’area di scrittura, per ciascun tema. Nell’editor si applicano quelli del tema attualmente attivo.">
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              { theme: 'light', title: 'Tema chiaro', bgKey: 'editor_bg_light', textKey: 'editor_text_light', defaults: DEFAULT_EDITOR_COLORS.light },
              { theme: 'dark', title: 'Tema scuro', bgKey: 'editor_bg_dark', textKey: 'editor_text_dark', defaults: DEFAULT_EDITOR_COLORS.dark }
            ] as const).map(({ theme: themeName, title, bgKey, textKey, defaults }) => {
              const bg = settings[bgKey] || defaults.background
              const text = settings[textKey] || defaults.text
              return (
                <div key={themeName} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
                    <button
                      onClick={() => update({ [bgKey]: defaults.background, [textKey]: defaults.text })}
                      className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Ripristina default
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input type="color" value={bg} onChange={(e) => update({ [bgKey]: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-gray-300 p-0 dark:border-gray-600" />
                      Sfondo
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input type="color" value={text} onChange={(e) => update({ [textKey]: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-gray-300 p-0 dark:border-gray-600" />
                      Testo
                    </label>
                  </div>
                  {/* Anteprima con i colori scelti, così l'effetto (e la leggibilità) si vede subito senza aprire una scena. */}
                  <div className="mt-3 rounded px-3 py-2 text-sm" style={{ backgroundColor: bg, color: text }}>
                    Anteprima: «Ciao», disse. – Come stai?
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
        <SectionCard title="Correttore ortografico e dizionari" description="Più lingue possono essere attive insieme (es. Italiano e Inglese): ogni parola viene controllata su tutti i dizionari selezionati.">
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div><div className="text-sm font-medium text-gray-900 dark:text-gray-100">Controllo ortografico</div><div className="text-xs text-gray-500 dark:text-gray-400">Abilita il controllo ortografico nativo dell’editor.</div></div><Toggle checked={!!settings.spellcheck_enabled} onChange={v => update({ spellcheck_enabled: v })} /></div>
            {(() => {
              const selected: string[] = settings.dictionary_languages?.length ? settings.dictionary_languages : ['it-IT', 'en-US']
              const toggleLanguage = (code: string) => {
                const next = selected.includes(code) ? selected.filter(c => c !== code) : [...selected, code]
                update({ dictionary_languages: next })
              }
              // v0.3.6: senza controllo ortografico i dizionari non hanno
              // effetto, quindi il blocco è disattivato (non cancellato: la
              // selezione resta pronta per quando lo si riattiva).
              const spellcheckOn = !!settings.spellcheck_enabled
              return (
                <div className={spellcheckOn ? undefined : 'pointer-events-none opacity-50'} aria-disabled={!spellcheckOn}>
                  <span className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Dizionari</span>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {DICTIONARY_LANGUAGES.map(code => (
                      <label key={code} className="flex cursor-pointer items-center gap-2 rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700">
                        <input type="checkbox" disabled={!spellcheckOn} checked={selected.includes(code)} onChange={() => toggleLanguage(code)} />
                        {code}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </SectionCard>
        <SectionCard title="Strumenti toolbar" description="Scegli quali strumenti visualizzare nella barra dell’editor e trascinali per cambiarne l’ordine.">
          <div className="mb-3 flex justify-end"><button type="button" onClick={() => update({ editor_toolbar_tools: DEFAULT_TOOLBAR_TOOLS })} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">Ripristina tutti</button></div>
          {(() => {
            const enabledIds: ToolbarTool[] = settings.editor_toolbar_tools?.length ? settings.editor_toolbar_tools : DEFAULT_TOOLBAR_TOOLS
            const labelOf = (id: ToolbarTool) => ALL_TOOLBAR_TOOLS.find(t => t.id === id)?.label ?? id
            const disabledTools = ALL_TOOLBAR_TOOLS.filter(t => !enabledIds.includes(t.id))

            const handleDragEnd = (e: DragEndEvent) => {
              const { active, over } = e
              if (!over || active.id === over.id) return
              const oldIndex = enabledIds.indexOf(active.id as ToolbarTool)
              const newIndex = enabledIds.indexOf(over.id as ToolbarTool)
              if (oldIndex === -1 || newIndex === -1) return
              update({ editor_toolbar_tools: arrayMove(enabledIds, oldIndex, newIndex) })
            }

            return (
              <div className="space-y-4">
                <div>
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">Attivi (trascina per riordinare)</span>
                  <DndContext sensors={toolbarSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={enabledIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {enabledIds.map(id => (
                          <SortableToolRow
                            key={id}
                            id={id}
                            label={labelOf(id)}
                            onToggle={() => update({ editor_toolbar_tools: enabledIds.filter(t => t !== id) })}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
                {disabledTools.length > 0 && (
                  <div>
                    <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">Non attivi</span>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {disabledTools.map(tool => (
                        <label key={tool.id} className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-gray-300 px-2 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700">
                          <input type="checkbox" checked={false} onChange={() => update({ editor_toolbar_tools: [...enabledIds, tool.id] })} />
                          {tool.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </SectionCard>
      </div>}

      {/* v0.3.7: scheda Log spostata qui da Statistiche, tra Editor e Avanzate; il toggle "Registra attività" ora vive qui in cima, non più nella tab Editor. */}
      {activeTab === 'log' && <div className="w-full space-y-4">
        <SectionCard title="Registro attività" description="Tiene traccia di creazioni, modifiche, eliminazioni e spostamenti per ogni progetto; mostra il recap all'apertura del progetto e chiede una nota &quot;To Do&quot; alla sua chiusura.">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Registra attività (Log)</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Disattivandolo, niente più voci nel registro, niente recap e niente richiesta "To Do" (la scheda sotto resta comunque consultabile per le voci già registrate).</div>
            </div>
            <Toggle checked={settings.activity_log_enabled === undefined ? true : !!settings.activity_log_enabled} onChange={v => update({ activity_log_enabled: v })} />
          </div>
        </SectionCard>
        <SectionCard title="Registro del progetto aperto" description="Lo storico delle operazioni per il progetto attualmente aperto.">
          {activeProjectId ? <LogTab projectId={activeProjectId} /> : <p className="text-sm text-gray-400">Apri un progetto dal Manoscritto per vedere il suo registro attività.</p>}
        </SectionCard>
      </div>}

      {activeTab === 'advanced' && <div className="w-full space-y-4">
        <SectionCard title="Stato database">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400" title={dbStatus?.path}>
              {dbStatus?.path || 'Percorso database non disponibile.'}
              {dbStatus?.path && (
                <button
                  onClick={() => window.mybook.export.showInFolder(dbStatus.path)}
                  className="ml-2 font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Mostra nella cartella
                </button>
              )}
            </p>
            {/* v0.3.6: "Aggiorna" spostato accanto a "Mostra/Nascondi tabelle vuote", nello stesso gruppo. */}
            <div className="flex shrink-0 items-center gap-3">
              <button onClick={() => void loadDbStatus()} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">Aggiorna</button>
              <button onClick={() => setHideEmptyTables(v => !v)} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                {hideEmptyTables ? 'Mostra tabelle vuote' : 'Nascondi tabelle vuote'}
              </button>
            </div>
          </div>
          {!dbStatus && dbStatusLoading ? <p className="text-sm text-gray-500 dark:text-gray-400">Lettura database…</p> : (() => {
            // v0.3.6: "Aggiorna" non deve richiudere la tabella se era espansa.
            // Due correzioni insieme: lo stato "aperta/chiusa" è ora controllato
            // da React (tablesExpanded), non lasciato al solo <details> nativo;
            // e durante un refresh (dbStatusLoading) restano visibili i dati
            // precedenti invece di smontare l'intero blocco (altrimenti anche
            // uno stato controllato ripartirebbe da un elemento nuovo).
            const visibleTables = (dbStatus?.tables ?? []).filter(t => !hideEmptyTables || t.records > 0)
            return (
              <details
                open={tablesExpanded}
                onToggle={(e) => setTablesExpanded(e.currentTarget.open)}
                className="group overflow-hidden rounded border border-gray-200 dark:border-gray-700"
              >
                <summary className="cursor-pointer select-none bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 marker:content-none dark:bg-gray-700 dark:text-gray-200">
                  Tabelle e record ({visibleTables.length}{hideEmptyTables && dbStatus && dbStatus.tables.length !== visibleTables.length ? ` di ${dbStatus.tables.length}` : ''})
                </summary>
                <table className="w-full text-sm"><thead className="bg-gray-50 dark:bg-gray-700"><tr><th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-200">Tabella</th><th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-200">Record</th></tr></thead><tbody>{visibleTables.map(t => <tr key={t.name} className="border-t border-gray-200 dark:border-gray-700"><td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{t.name}</td><td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{t.records.toLocaleString('it-IT')}</td></tr>)}</tbody></table>
              </details>
            )
          })()}
        </SectionCard>
        <SectionCard title="Manutenzione database" description="Operazioni distruttive. Le operazioni di reset e caricamento riavviano automaticamente l’app.">
          <div className="grid gap-3 md:grid-cols-3">
            <button onClick={() => void clearDb()} className="flex items-center gap-3 rounded-lg border border-orange-300 p-4 text-left hover:bg-orange-50 dark:border-orange-800 dark:hover:bg-orange-950/30"><Trash2 size={20} className="text-orange-600" /><span><strong className="block text-sm text-gray-900 dark:text-gray-100">Svuota</strong><span className="text-xs text-gray-500 dark:text-gray-400">Elimina i dati dei progetti.</span></span></button>
            <button onClick={() => void resetDb()} className="flex items-center gap-3 rounded-lg border border-red-300 p-4 text-left hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"><RotateCcw size={20} className="text-red-600" /><span><strong className="block text-sm text-gray-900 dark:text-gray-100">Reset completo</strong><span className="text-xs text-gray-500 dark:text-gray-400">Ricrea il database da zero.</span></span></button>
            <button onClick={() => void loadBackup()} className="flex items-center gap-3 rounded-lg border border-blue-300 p-4 text-left hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/30"><Upload size={20} className="text-blue-600" /><span><strong className="block text-sm text-gray-900 dark:text-gray-100">Carica backup</strong><span className="text-xs text-gray-500 dark:text-gray-400">Sostituisce il DB con un backup valido.</span></span></button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"><Database size={15} /> Il caricamento accetta database SQLite MyBook verificati con integrity_check.</div>
        </SectionCard>
      </div>}
    </div>
  </div>
}
