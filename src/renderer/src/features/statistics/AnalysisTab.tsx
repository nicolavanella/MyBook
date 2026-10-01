import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ProjectAnalysis, TextAnalysisResult } from '@shared/ipc/channels'
import { formatReadingTime, CHARS_PER_EDITORIAL_PAGE, WORDS_PER_PRINT_PAGE, READING_WORDS_PER_MINUTE } from '@shared/textAnalysis'

/**
 * Scheda Statistiche > Analisi (v0.3.5, estesa in v0.3.6): parole/caratteri/
 * frasi/paragrafi, dimensioni editoriali, parole chiave e tag presenti —
 * sull'intero progetto e per singolo capitolo. Il calcolo vero (analyzeText,
 * countAllEntityTags) sta in src/shared/; qui c'è solo la presentazione.
 */

// v0.3.6: le convenzioni editoriali adottate (dichiarate anche in
// shared/textAnalysis.ts) sono mostrate come tooltip sulle rispettive voci,
// invece che solo in un commento nel codice che l'utente non può vedere.
const EDITORIAL_PAGE_TOOLTIP = `1 cartella editoriale = ${CHARS_PER_EDITORIAL_PAGE.toLocaleString('it-IT')} caratteri spazi inclusi (convenzione più diffusa in Italia: 30 righe × 60 battute)`
const PRINT_PAGE_TOOLTIP = `1 pagina di stampa (stima) ≈ ${WORDS_PER_PRINT_PAGE} parole`
const READING_TIME_TOOLTIP = `Velocità di lettura assunta: ≈ ${READING_WORDS_PER_MINUTE} parole al minuto`

const METRIC_CARDS: { label: string; get: (a: TextAnalysisResult) => string; tooltip?: string }[] = [
  { label: 'Parole totali', get: (a) => a.words.toLocaleString('it-IT') },
  { label: 'Tempo di lettura', get: (a) => formatReadingTime(a.readingMinutes), tooltip: READING_TIME_TOOLTIP },
  { label: 'Caratteri (spazi inclusi)', get: (a) => a.charsWithSpaces.toLocaleString('it-IT') },
  { label: 'Caratteri (spazi esclusi)', get: (a) => a.charsWithoutSpaces.toLocaleString('it-IT') },
  { label: 'Frasi', get: (a) => a.sentences.toLocaleString('it-IT') },
  { label: 'Paragrafi', get: (a) => a.paragraphs.toLocaleString('it-IT') },
  { label: 'Cartelle editoriali', get: (a) => a.editorialPages.toLocaleString('it-IT', { maximumFractionDigits: 1 }), tooltip: EDITORIAL_PAGE_TOOLTIP },
  { label: 'Pagine di stampa (stima)', get: (a) => a.printPages.toLocaleString('it-IT', { maximumFractionDigits: 1 }), tooltip: PRINT_PAGE_TOOLTIP }
]

function MetricGrid({ analysis }: { analysis: TextAnalysisResult }): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {METRIC_CARDS.map((card) => (
        <div key={card.label} className="rounded border border-gray-200 p-3 dark:border-gray-700" title={card.tooltip}>
          <div className="text-xl font-semibold">{card.get(analysis)}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{card.label}</div>
        </div>
      ))}
    </div>
  )
}

/** Sezione richiudibile, chiusa di default (v0.3.6): usata per Parole chiave e Tag presenti, sia a livello di progetto che di capitolo. */
function CollapsibleSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {title} {count > 0 && <span className="normal-case text-gray-400">({count})</span>}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

function KeywordList({ keywords }: { keywords: TextAnalysisResult['keywords'] }): JSX.Element {
  if (keywords.length === 0) return <p className="text-sm text-gray-400">Non ci sono ancora abbastanza parole per un'analisi.</p>
  const max = keywords[0]?.count ?? 1
  return (
    <ul className="space-y-1.5">
      {keywords.map((k) => (
        <li key={k.word} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate" title={k.word}>{k.word}</span>
          <div className="h-2 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
            <div className="h-full rounded bg-blue-400" style={{ width: `${Math.max(6, (k.count / max) * 100)}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs text-gray-500">{k.count}</span>
        </li>
      ))}
    </ul>
  )
}

const ENTITY_TYPE_LABEL: Record<string, string> = { character: 'Personaggio', location: 'Località', object: 'Oggetto' }

function TagList({
  tags,
  nameOf
}: {
  tags: { entityType: string; entityId: string; count: number }[]
  nameOf: (entityType: string, entityId: string) => string
}): JSX.Element {
  if (tags.length === 0) return <p className="text-sm text-gray-400">Nessun tag in questo capitolo.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
          <th className="py-1 pr-4 font-medium">Tag</th>
          <th className="py-1 pr-4 font-medium">Tipo</th>
          <th className="py-1 font-medium">Occorrenze</th>
        </tr>
      </thead>
      <tbody>
        {tags.map((t) => (
          <tr key={`${t.entityType}:${t.entityId}`} className="border-t border-gray-100 dark:border-gray-800">
            <td className="py-1 pr-4">{nameOf(t.entityType, t.entityId)}</td>
            <td className="py-1 pr-4 text-gray-500">{ENTITY_TYPE_LABEL[t.entityType] ?? t.entityType}</td>
            <td className="py-1">{t.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AnalysisTab({ projectId }: { projectId: string }): JSX.Element {
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null)
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null)
  // v0.3.6: i tag salvano solo entityType/entityId — il nome va risolto qui
  // consultando gli elenchi di Personaggi/Località/Oggetti del progetto,
  // anziché duplicare quella logica lato main.
  const [entityNames, setEntityNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    setAnalysis(null)
    window.mybook.statistics.getAnalysis(projectId).then((result: ProjectAnalysis) => {
      if (!cancelled) setAnalysis(result)
    })
    Promise.all([
      window.mybook.characters.list(projectId),
      window.mybook.locations.list(projectId),
      window.mybook.objects.list(projectId)
    ]).then(([characters, locations, objects]: [any[], any[], any[]]) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const c of characters) map[`character:${c.id}`] = c.name
      for (const l of locations) map[`location:${l.id}`] = l.name
      for (const o of objects) map[`object:${o.id}`] = o.name
      setEntityNames(map)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const nameOf = (entityType: string, entityId: string): string => entityNames[`${entityType}:${entityId}`] ?? '(eliminata)'

  if (!analysis) return <div className="text-sm text-gray-400">Analisi in corso…</div>

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Intero progetto</h2>
        <MetricGrid analysis={analysis.total} />
        <CollapsibleSection title="Parole chiave più usate" count={analysis.total.keywords.length}>
          <KeywordList keywords={analysis.total.keywords} />
        </CollapsibleSection>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Per capitolo</h2>
        {analysis.chapters.length === 0 ? (
          <p className="text-sm text-gray-400">Nessun capitolo ancora creato.</p>
        ) : (
          <div className="space-y-2">
            {analysis.chapters.map((chapter) => {
              const expanded = expandedChapterId === chapter.chapterId
              return (
                <div key={chapter.chapterId} className="rounded border border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setExpandedChapterId(expanded ? null : chapter.chapterId)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <span className="font-medium">{chapter.chapterTitle}</span>
                    <span className="text-xs text-gray-500">
                      {chapter.words.toLocaleString('it-IT')} parole · {formatReadingTime(chapter.readingMinutes)}
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-100 p-3 dark:border-gray-700">
                      <MetricGrid analysis={chapter} />
                      <CollapsibleSection title="Parole chiave più usate" count={chapter.keywords.length}>
                        <KeywordList keywords={chapter.keywords} />
                      </CollapsibleSection>
                      <CollapsibleSection title="Tag presenti" count={chapter.tags.length}>
                        <TagList tags={chapter.tags} nameOf={nameOf} />
                      </CollapsibleSection>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
