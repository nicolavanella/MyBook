import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, BookOpen, FileUp } from 'lucide-react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import ProjectFormModal, { type ProjectFormValues } from './ProjectFormModal'
import { useConfirm } from '@renderer/components/ConfirmDialog'

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

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Mai aperto'
  const date = new Date(dateStr)
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Oggi'
  if (days === 1) return 'Ieri'
  if (days < 30) return `${days} giorni fa`
  return date.toLocaleDateString('it-IT')
}

export default function ProjectsPage(): JSX.Element {
  const { setActiveProject } = useProjectStore()
  const navigate = useNavigate()
  const confirm = useConfirm()
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
      fabula: values.fabula || undefined
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
      message: `Eliminare definitivamente "${title}"? Tutti i capitoli, scene, personaggi, località e mappe andranno persi. L'operazione non è reversibile.`,
      confirmLabel: 'Elimina',
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
        <h1 className="text-xl font-semibold">Progetti</h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Nuovo progetto
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-gray-400">
          Nessun progetto ancora. Creane uno per iniziare a scrivere.
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
                  <span>{p.totalWords.toLocaleString('it-IT')} parole</span>
                  <span>
                    {p.chapterCount} {p.chapterCount === 1 ? 'capitolo' : 'capitoli'}
                  </span>
                  <span>Aperto: {formatRelative(p.last_opened_at)}</span>
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
                      Crea copia
                    </button>
                    <button
                      onClick={() => handleExportProject(p.id)}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
                    >
                      Esporta progetto
                    </button>
                    <button
                      onClick={() => handleExport(p.id)}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
                    >
                      Esporta manoscritto
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.title)}
                      className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                    >
                      Elimina
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
          <p className="text-sm font-medium text-gray-700">Importa progetto</p>
          <p className="mt-1 text-sm text-gray-400">Ripristina un file JSON esportato da MyBook.</p>
        </div>
        <button
          onClick={handleImportProject}
          className="inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <FileUp size={16} /> Seleziona file
        </button>
      </div>

      {showNewModal && (
        <ProjectFormModal
          title="Nuovo progetto"
          submitLabel="Crea"
          onClose={() => setShowNewModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  )
}
