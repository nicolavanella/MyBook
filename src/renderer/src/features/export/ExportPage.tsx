import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import type { ExportFormat } from '@shared/ipc/channels'
import { toggleSelectionCascade } from './selection'
import { getRootItems, getChaptersOfGroup, getScenesOfChapter } from '@shared/manuscriptTree'
import { Folder } from 'lucide-react'
import type { TranslationKey } from '@shared/i18n'
import { useTranslation } from '@renderer/i18n/useTranslation'

// v0.4.0: testi come chiavi i18n. Le etichette che sono nomi di formato (PDF, EPUB…) restano letterali e `labelKey` è assente.
const FORMATS: { value: ExportFormat; label?: string; labelKey?: TranslationKey; hintKey: TranslationKey }[] = [
  { value: 'pdf', label: 'PDF', hintKey: 'export.format.pdf.hint' },
  { value: 'epub', label: 'EPUB', hintKey: 'export.format.epub.hint' },
  { value: 'docx', label: 'Word (.docx)', hintKey: 'export.format.docx.hint' },
  { value: 'txt', labelKey: 'export.format.txt.label', hintKey: 'export.format.txt.hint' },
  { value: 'md', label: 'Markdown (.md)', hintKey: 'export.format.md.hint' },
  { value: 'html', label: 'HTML', hintKey: 'export.format.html.hint' }
]

const SEPARATORS: { value: 'title' | 'stars' | 'none'; label?: string; labelKey?: TranslationKey }[] = [
  { value: 'title', labelKey: 'export.sep.sceneName' },
  { value: 'stars', label: '***' },
  { value: 'none', labelKey: 'export.sep.none' }
]

const PART_SEPARATORS: { value: 'title' | 'none'; labelKey: TranslationKey }[] = [
  { value: 'title', labelKey: 'export.sep.partName' },
  { value: 'none', labelKey: 'export.sep.none' }
]

const CHAPTER_SEPARATORS: { value: 'title' | 'none'; labelKey: TranslationKey }[] = [
  { value: 'title', labelKey: 'export.sep.chapterName' },
  { value: 'none', labelKey: 'export.sep.none' }
]

export default function ExportPage(): JSX.Element {
  const { t } = useTranslation()
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
    return <div className="p-6 text-sm text-gray-400">{t('common.openProject')}</div>
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
      <h1 className="mb-1 shrink-0 text-xl font-semibold">{t('nav.export')}</h1>
      <p className="mb-6 shrink-0 text-sm text-gray-500">
        {t('export.description')}
      </p>

      <div ref={gridRef} className="grid min-h-0 flex-1 grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="overflow-auto pr-1">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('export.formatHeading')}</h2>
          <div className="mb-6 grid grid-cols-2 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`rounded border p-3 text-left text-sm transition-colors ${
                  format === f.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{f.labelKey ? t(f.labelKey) : f.label}</div>
                <div className="text-xs text-gray-500">{t(f.hintKey)}</div>
              </button>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('export.partSeparator')}
          </h2>
          <p className="mb-2 text-xs text-gray-400">
            {t('export.partSeparatorHint')}
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
                {t(s.labelKey)}
              </button>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('export.chapterSeparator')}
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
                {t(s.labelKey)}
              </button>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('export.sceneSeparator')}
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
                {s.labelKey ? t(s.labelKey) : s.label}
              </button>
            ))}
          </div>

          <button
            ref={exportButtonRef}
            onClick={handleExport}
            disabled={status === 'exporting'}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {status === 'exporting' ? t('export.exporting') : t('export.exportAs', { format: format.toUpperCase() })}
          </button>

          {status === 'done' && (
            <div className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm">
              <p className="mb-2 text-green-700">{lastPath ? t('export.doneIn', { path: lastPath }) : t('export.done')}</p>
              {lastPath && (
                <div className="flex gap-2">
                  <button
                    onClick={() => window.mybook.export.openFile(lastPath)}
                    className="rounded border border-green-300 bg-white px-3 py-1 text-xs text-green-800 hover:bg-green-100"
                  >
                    {t('export.openFile')}
                  </button>
                  <button
                    onClick={() => window.mybook.export.showInFolder(lastPath)}
                    className="rounded border border-green-300 bg-white px-3 py-1 text-xs text-green-800 hover:bg-green-100"
                  >
                    {t('common.showInFolder')}
                  </button>
                </div>
              )}
            </div>
          )}
          {status === 'error' && <p className="mt-3 text-sm text-red-600">{t('export.failed')}</p>}
        </div>

        <div className="flex min-h-0 flex-col" style={{ maxHeight: rightColumnMaxHeight }}>
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('export.include')}
            </h2>
            <div className="flex shrink-0 gap-3">
              <button onClick={() => setSelectedIds(null)} className="text-xs text-blue-600 hover:underline">
                {t('export.selectAll')}
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-600 hover:underline">
                {t('export.deselectAll')}
              </button>
            </div>
          </div>
          {/* maxHeight impostato via JS in base alla posizione del bottone
              "Esporta come…" nella colonna sinistra (vedi effect sopra):
              questo div non deve mai superare quel limite, anche se il
              manoscritto ha molti capitoli/gruppi. */}
          <div className="min-h-0 flex-1 overflow-auto rounded border border-gray-200 p-3">
            {rootItems.length === 0 ? (
              <p className="text-sm text-gray-400">{t('common.noChapters')}</p>
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
