import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, BookOpen, FileUp } from 'lucide-react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import ProjectFormModal, { type ProjectFormValues } from './ProjectFormModal'
import { useConfirm } from '@renderer/components/ConfirmDialog'
import { useTranslation } from '@renderer/i18n/useTranslation'
import { localeOf, type Translator, type Language } from '@shared/i18n'

interface ProjectWithStats {
  id: string
  title: string
  subtitle: string
  author: string | null
  updated_at: string
  last_opened_at: string | null
  totalWords: number
  chapterCount: number
}

function formatRelative(dateStr: string | null, t: Translator, language: Language): string {
  if (!dateStr) return t('projects.neverOpened')
  const date = new Date(dateStr)
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return t('projects.today')
  if (days === 1) return t('projects.yesterday')
  if (days < 30) return t('projects.daysAgo', { count: days })
  return date.toLocaleDateString(localeOf(language))
}

export default function ProjectsPage(): JSX.Element {
  const { setActiveProject } = useProjectStore()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { t, language, locale } = useTranslation()
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [showNewModal, setShowNewModal] = useState(false)
  const [openMenu, setOpenMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const reload = () => {
    window.mybook.projects.listWithStats().then(setProjects)
  }

  useEffect(() => {
    reload()
  }, [])

  const openProject = async (id: string) => {
    await setActiveProject(id)
    // v0.3.9: la sezione di apertura la decide MainLayout (restore
    // dell'ultima sezione salvata, o '/' come ripiego) — non navighiamo qui,
    // altrimenti vincerebbe questa e non il ripristino.
  }

  const handleCreate = async (values: ProjectFormValues) => {
    await window.mybook.projects.create({
      title: values.title,
      subtitle: values.subtitle || undefined,
      author: values.author || undefined,
      year: values.year ? Number(values.year) : undefined,
      description: values.description || undefined,
      notes: values.notes || undefined,
      plot: values.plot || undefined,
      fabula: values.fabula || undefined,
      book_language: values.bookLanguage
    })
    reload()
    setShowNewModal(false)
  }

  const handleDuplicate = async (id: string) => {
    setOpenMenu(null)
    await window.mybook.projects.duplicate(id)
    reload()
  }

  const handleDelete = async (id: string, title: string) => {
    setOpenMenu(null)
    const ok = await confirm({
      message: t('projects.confirmDelete', { title }),
      confirmLabel: t('common.delete'),
      danger: true
    })
    if (!ok) return
    await window.mybook.projects.delete(id)
    reload()
  }

  const handleExport = async (id: string) => {
    setOpenMenu(null)
    // v0.3.9: scritto PRIMA di attivare il progetto, così il ripristino
    // sezione di MainLayout (che legge questo stato appena il progetto
    // diventa attivo) trova già "/export" e non un'altra sezione salvata in
    // precedenza — l'azione "Esporta" ha una destinazione esplicita, che
    // deve vincere sul ripristino automatico.
    await window.mybook.projects.setUiState(id, { lastRoute: '/export' })
    await setActiveProject(id)
    navigate('/export')
  }

  const handleExportProject = async (id: string) => {
    setOpenMenu(null)
    await window.mybook.projects.exportData(id)
  }

  const handleImportProject = async () => {
    const result = await window.mybook.projects.importData()
    if (result?.ok) reload()
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('nav.projects')}</h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {t('projects.new')}
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-gray-400">
          {t('projects.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group relative rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm"
            >
              <button onClick={() => openProject(p.id)} className="block w-full text-left">
                <div className="mb-2 flex items-center gap-2">
                  <BookOpen size={16} className="shrink-0 text-gray-400" />
                  <span className="truncate font-medium">{p.title}</span>
                </div>
                {p.subtitle && <p className="mb-2 truncate text-xs text-gray-500">{p.subtitle}</p>}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span>{t('projects.words', { count: p.totalWords, n: p.totalWords.toLocaleString(locale) })}</span>
                  <span>{t('projects.chapters', { count: p.chapterCount })}</span>
                  <span>{t('projects.openedAgo', { when: formatRelative(p.last_opened_at, t, language) })}</span>
                </div>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const rect = (e.target as HTMLElement).getBoundingClientRect()
                  setOpenMenu(openMenu?.id === p.id ? null : { id: p.id, x: rect.left, y: rect.bottom + 4 })
                }}
                className="absolute right-3 top-3 rounded p-1 text-gray-300 opacity-0 hover:text-gray-600 group-hover:opacity-100"
              >
                <MoreVertical size={15} />
              </button>

              {openMenu?.id === p.id && (
                <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)}>
                  <div
                    className="absolute z-50 w-40 rounded border border-gray-200 bg-white py-1 text-sm shadow-lg"
                    style={{ left: openMenu.x - 100, top: openMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleDuplicate(p.id)}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
                    >
                      {t('projects.menu.duplicate')}
                    </button>
                    <button
                      onClick={() => handleExportProject(p.id)}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
                    >
                      {t('projects.menu.exportProject')}
                    </button>
                    <button
                      onClick={() => handleExport(p.id)}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
                    >
                      {t('projects.menu.exportManuscript')}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.title)}
                      className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between rounded border border-dashed border-gray-300 p-4">
        <div>
          <p className="text-sm font-medium text-gray-700">{t('projects.import.title')}</p>
          <p className="mt-1 text-sm text-gray-400">{t('projects.import.description')}</p>
        </div>
        <button
          onClick={handleImportProject}
          className="inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <FileUp size={16} /> {t('projects.import.pick')}
        </button>
      </div>

      {showNewModal && (
        <ProjectFormModal
          title={t('projects.new.title')}
          submitLabel={t('common.create')}
          onClose={() => setShowNewModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  )
}
