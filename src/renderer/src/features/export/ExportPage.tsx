import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import type { ExportFormat } from '@shared/ipc/channels'
import { toggleSelectionCascade } from './selection'
import { getRootItems, getChaptersOfGroup, getScenesOfChapter } from '@shared/manuscriptTree'
import { Folder } from 'lucide-react'

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'pdf', label: 'PDF', hint: 'Pronto per la stampa o la lettura' },
  { value: 'epub', label: 'EPUB', hint: 'Per e-reader (Kindle richiede conversione)' },
  { value: 'docx', label: 'Word (.docx)', hint: 'Per continuare a lavorarci in Word' },
  { value: 'txt', label: 'Testo semplice (.txt)', hint: 'Senza formattazione' },
  { value: 'md', label: 'Markdown (.md)', hint: 'Grassetto/corsivo come **testo**' },
  { value: 'html', label: 'HTML', hint: 'Pagina web singola' }
]

const SEPARATORS: { value: 'title' | 'stars' | 'none'; label: string }[] = [
  { value: 'title', label: 'Nome scena' },
  { value: 'stars', label: '***' },
  { value: 'none', label: 'Niente' }
]

const PART_SEPARATORS: { value: 'title' | 'none'; label: string }[] = [
  { value: 'title', label: 'Nome Parte' },
  { value: 'none', label: 'Niente' }
]

const CHAPTER_SEPARATORS: { value: 'title' | 'none'; label: string }[] = [
  { value: 'title', label: 'Nome Capitolo' },
  { value: 'none', label: 'Niente' }
]

export default function ExportPage(): JSX.Element {
  const { activeProjectId, tree, loadTree } = useProjectStore()
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [partSeparator, setPartSeparator] = useState<'title' | 'none'>('title')
  const [chapterSeparator, setChapterSeparator] = useState<'title' | 'none'>('title')
  const [separator, setSeparator] = useState<'title' | 'stars' | 'none'>('title')
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null) // null = tutto il progetto
  const [status, setStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
  const [lastPath, setLastPath] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const [rightColumnMaxHeight, setRightColumnMaxHeight] = useState<number>()

  useEffect(() => {
    if (activeProjectId) loadTree()
  }, [activeProjectId])

  /**
   * La colonna destra ("Capitoli e scene da includere") non deve superare in
   * altezza la colonna sinistra fino al bottone "Esporta come…": misuriamo
   * la distanza tra la cima della griglia e il fondo del bottone, e la
   * applichiamo come max-height. Ricalcolato al resize della finestra e ad
   * ogni variazione di layout della griglia (un ResizeObserver copre anche
   * l'a capo dei bottoni formato su schermi stretti, che sposterebbe il
   * bottone "Esporta" più in basso).
   */
  useEffect(() => {
    const measure = () => {
      if (!gridRef.current || !exportButtonRef.current) return
      const gridTop = gridRef.current.getBoundingClientRect().top
      const buttonBottom = exportButtonRef.current.getBoundingClientRect().bottom
      setRightColumnMaxHeight(buttonBottom - gridTop)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (gridRef.current) ro.observe(gridRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [activeProjectId])

  if (!activeProjectId) {
    return <div className="p-6 text-sm text-gray-400">Apri un progetto dal Manoscritto.</div>
  }

  const rootItems = getRootItems(tree)
  const chaptersOfGroup = (groupId: string) => getChaptersOfGroup(tree, groupId)
  const scenesOf = (chapterId: string) => getScenesOfChapter(tree, chapterId)

  /**
   * Selezione/deselezione di un nodo per l'export. Per i capitoli propaga lo
   * stesso cambiamento a tutte le scene contenute; per un gruppo, a tutti i
   * suoi capitoli E le loro scene (il backend, vedi export.service.ts,
   * espande comunque automaticamente un gruppo selezionato ai suoi
   * discendenti — qui serve anche per riflettere subito lo stato nelle
   * checkbox dei singoli capitoli/scene). Così deselezionare un
   * capitolo/gruppo non lascia mai scene "orfane" incluse per errore.
   * Logica pura testata in tests/renderer/export-selection.test.ts.
   */
  const toggleNode = (id: string, childIds: string[] = []) => {
    setSelectedIds((prev) => toggleSelectionCascade(prev, tree.map((n) => n.id), id, childIds))
  }

  const isChecked = (id: string) => selectedIds === null || selectedIds.has(id)

  const handleExport = async () => {
    setStatus('exporting')
    try {
      const options = {
        nodeIds: selectedIds ? Array.from(selectedIds) : undefined,
        sceneSeparator: separator,
        partSeparator,
        chapterSeparator
      }
      const result = await window.mybook.export.project(activeProjectId, format, options)
      if (result.ok) {
        setStatus('done')
        setLastPath(result.filePath ?? null)
      } else {
        setStatus('idle') // utente ha annullato il dialog di salvataggio
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="mb-1 shrink-0 text-xl font-semibold">Esporta</h1>
      <p className="mb-6 shrink-0 text-sm text-gray-500">
        Esporta il manoscritto (o solo i capitoli/scene selezionati) nel formato scelto.
      </p>

      <div ref={gridRef} className="grid min-h-0 flex-1 grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="overflow-auto pr-1">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Formato</h2>
          <div className="mb-6 grid grid-cols-2 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`rounded border p-3 text-left text-sm transition-colors ${
                  format === f.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-gray-500">{f.hint}</div>
              </button>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Separatore tra le parti
          </h2>
          <p className="mb-2 text-xs text-gray-400">
            Ogni parte (Gruppo di Capitoli) inizia sempre da una nuova pagina; qui scegli se mostrarne anche il nome.
          </p>
          <div className="mb-6 flex gap-2">
            {PART_SEPARATORS.map((s) => (
              <button
                key={s.value}
                onClick={() => setPartSeparator(s.value)}
                className={`rounded border px-3 py-1.5 text-sm ${
                  partSeparator === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Separatore tra i capitoli
          </h2>
          <div className="mb-6 flex gap-2">
            {CHAPTER_SEPARATORS.map((s) => (
              <button
                key={s.value}
                onClick={() => setChapterSeparator(s.value)}
                className={`rounded border px-3 py-1.5 text-sm ${
                  chapterSeparator === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Separatore tra le scene
          </h2>
          <div className="mb-6 flex gap-2">
            {SEPARATORS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSeparator(s.value)}
                className={`rounded border px-3 py-1.5 text-sm ${
                  separator === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            ref={exportButtonRef}
            onClick={handleExport}
            disabled={status === 'exporting'}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {status === 'exporting' ? 'Esportazione…' : `Esporta come ${format.toUpperCase()}`}
          </button>

          {status === 'done' && (
            <div className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm">
              <p className="mb-2 text-green-700">Esportato con successo{lastPath ? ` in ${lastPath}` : ''}.</p>
              {lastPath && (
                <div className="flex gap-2">
                  <button
                    onClick={() => window.mybook.export.openFile(lastPath)}
                    className="rounded border border-green-300 bg-white px-3 py-1 text-xs text-green-800 hover:bg-green-100"
                  >
                    Apri file
                  </button>
                  <button
                    onClick={() => window.mybook.export.showInFolder(lastPath)}
                    className="rounded border border-green-300 bg-white px-3 py-1 text-xs text-green-800 hover:bg-green-100"
                  >
                    Mostra nella cartella
                  </button>
                </div>
              )}
            </div>
          )}
          {status === 'error' && <p className="mt-3 text-sm text-red-600">Esportazione fallita. Riprova.</p>}
        </div>

        <div className="flex min-h-0 flex-col" style={{ maxHeight: rightColumnMaxHeight }}>
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Capitoli e scene da includere
            </h2>
            <div className="flex shrink-0 gap-3">
              <button onClick={() => setSelectedIds(null)} className="text-xs text-blue-600 hover:underline">
                Seleziona tutto
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-600 hover:underline">
                Deseleziona tutto
              </button>
            </div>
          </div>
          {/* maxHeight impostato via JS in base alla posizione del bottone
              "Esporta come…" nella colonna sinistra (vedi effect sopra):
              questo div non deve mai superare quel limite, anche se il
              manoscritto ha molti capitoli/gruppi. */}
          <div className="min-h-0 flex-1 overflow-auto rounded border border-gray-200 p-3">
            {rootItems.length === 0 ? (
              <p className="text-sm text-gray-400">Nessun capitolo ancora creato.</p>
            ) : (
              rootItems.map((item) =>
                item.node_type === 'group' ? (
                  <div key={item.id} className="mb-3 rounded border border-gray-100 bg-gray-50/60 p-2 dark:border-gray-700 dark:bg-gray-800/40">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={isChecked(item.id)}
                        onChange={() =>
                          toggleNode(item.id, [
                            ...chaptersOfGroup(item.id).map((c) => c.id),
                            ...chaptersOfGroup(item.id).flatMap((c) => scenesOf(c.id).map((s) => s.id))
                          ])
                        }
                      />
                      <Folder size={13} className="shrink-0 text-amber-500" />
                      {item.title}
                    </label>
                    <div className="ml-5 mt-2 space-y-2">
                      {chaptersOfGroup(item.id).map((c) => (
                        <div key={c.id}>
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={isChecked(c.id)}
                              onChange={() => toggleNode(c.id, scenesOf(c.id).map((s) => s.id))}
                            />
                            {c.title}
                          </label>
                          <div className="ml-5 mt-1 space-y-1">
                            {scenesOf(c.id).map((s) => (
                              <label key={s.id} className="flex items-center gap-2 text-xs text-gray-600">
                                <input type="checkbox" checked={isChecked(s.id)} onChange={() => toggleNode(s.id)} />
                                {s.title}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={item.id} className="mb-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={isChecked(item.id)}
                        onChange={() => toggleNode(item.id, scenesOf(item.id).map((s) => s.id))}
                      />
                      {item.title}
                    </label>
                    <div className="ml-5 mt-1 space-y-1">
                      {scenesOf(item.id).map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-xs text-gray-600">
                          <input type="checkbox" checked={isChecked(s.id)} onChange={() => toggleNode(s.id)} />
                          {s.title}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
