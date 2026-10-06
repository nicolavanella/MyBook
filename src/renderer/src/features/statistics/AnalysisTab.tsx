import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ProjectAnalysis, TextAnalysisResult } from '@shared/ipc/channels'
import { formatReadingTime, CHARS_PER_EDITORIAL_PAGE, WORDS_PER_PRINT_PAGE, READING_WORDS_PER_MINUTE } from '@shared/textAnalysis'
import type { TranslationKey, Translator } from '@shared/i18n'
import { useTranslation } from '@renderer/i18n/useTranslation'

/**
 * Scheda Statistiche > Analisi (v0.3.5, estesa in v0.3.6): parole/caratteri/
 * frasi/paragrafi, dimensioni editoriali, parole chiave e tag presenti —
 * sull'intero progetto e per singolo capitolo. Il calcolo vero (analyzeText,
 * countAllEntityTags) sta in src/shared/; qui c'è solo la presentazione.
 */

// v0.3.6: le convenzioni editoriali adottate (dichiarate anche in
// shared/textAnalysis.ts) sono mostrate come tooltip sulle rispettive voci,
// invece che solo in un commento nel codice che l'utente non può vedere.
// v0.4.0: etichette e tooltip dipendono dalla lingua, quindi le metriche si costruiscono con `t` e `locale` della UI.
function metricCards(t: Translator, locale: string): { key: TranslationKey; label: string; value: (a: TextAnalysisResult) => string; tooltip?: string }[] {
  return [
    { key: 'statistics.totalWords', label: t('statistics.totalWords'), value: (a) => a.words.toLocaleString(locale) },
    {
      key: 'analysis.metric.readingTime',
      label: t('analysis.metric.readingTime'),
      value: (a) => formatReadingTime(a.readingMinutes),
      tooltip: t('analysis.tooltip.reading', { wpm: READING_WORDS_PER_MINUTE })
    },
    { key: 'analysis.metric.charsWith', label: t('analysis.metric.charsWith'), value: (a) => a.charsWithSpaces.toLocaleString(locale) },
    { key: 'analysis.metric.charsWithout', label: t('analysis.metric.charsWithout'), value: (a) => a.charsWithoutSpaces.toLocaleString(locale) },
    { key: 'analysis.metric.sentences', label: t('analysis.metric.sentences'), value: (a) => a.sentences.toLocaleString(locale) },
    { key: 'analysis.metric.paragraphs', label: t('analysis.metric.paragraphs'), value: (a) => a.paragraphs.toLocaleString(locale) },
    {
      key: 'analysis.metric.editorialPages',
      label: t('analysis.metric.editorialPages'),
      value: (a) => a.editorialPages.toLocaleString(locale, { maximumFractionDigits: 1 }),
      tooltip: t('analysis.tooltip.editorialPage', { chars: CHARS_PER_EDITORIAL_PAGE.toLocaleString(locale) })
    },
    {
      key: 'analysis.metric.printPages',
      label: t('analysis.metric.printPages'),
      value: (a) => a.printPages.toLocaleString(locale, { maximumFractionDigits: 1 }),
      tooltip: t('analysis.tooltip.printPage', { words: WORDS_PER_PRINT_PAGE })
    }
  ]
}

function MetricGrid({ analysis }: { analysis: TextAnalysisResult }): JSX.Element {
  const { t, locale } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {metricCards(t, locale).map((card) => (
        <div key={card.key} className="rounded border border-gray-200 p-3 dark:border-gray-700" title={card.tooltip}>
          <div className="text-xl font-semibold">{card.value(analysis)}</div>
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
  const { t } = useTranslation()
  if (keywords.length === 0) return <p className="text-sm text-gray-400">{t('analysis.notEnoughWords')}</p>
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

const ENTITY_TYPE_LABEL: Record<string, TranslationKey> = { character: 'entityType.character', location: 'entityType.location', object: 'entityType.object' }

function TagList({
  tags,
  nameOf
}: {
  tags: { entityType: string; entityId: string; count: number }[]
  nameOf: (entityType: string, entityId: string) => string
}): JSX.Element {
  const { t } = useTranslation()
  if (tags.length === 0) return <p className="text-sm text-gray-400">{t('analysis.noTags')}</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
          <th className="py-1 pr-4 font-medium">{t('editor.tagColumnTag')}</th>
          <th className="py-1 pr-4 font-medium">{t('editor.tagColumnType')}</th>
          <th className="py-1 font-medium">{t('analysis.occurrences')}</th>
        </tr>
      </thead>
      <tbody>
        {tags.map((tag) => (
          <tr key={`${tag.entityType}:${tag.entityId}`} className="border-t border-gray-100 dark:border-gray-800">
            <td className="py-1 pr-4">{nameOf(tag.entityType, tag.entityId)}</td>
            <td className="py-1 pr-4 text-gray-500">{ENTITY_TYPE_LABEL[tag.entityType] ? t(ENTITY_TYPE_LABEL[tag.entityType]) : tag.entityType}</td>
            <td className="py-1">{tag.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AnalysisTab({ projectId }: { projectId: string }): JSX.Element {
  const { t, locale } = useTranslation()
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

  const nameOf = (entityType: string, entityId: string): string => entityNames[`${entityType}:${entityId}`] ?? t('analysis.deleted')

  if (!analysis) return <div className="text-sm text-gray-400">{t('analysis.running')}</div>

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('analysis.wholeProject')}</h2>
        <MetricGrid analysis={analysis.total} />
        <CollapsibleSection title={t('analysis.keywords')} count={analysis.total.keywords.length}>
          <KeywordList keywords={analysis.total.keywords} />
        </CollapsibleSection>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('statistics.perChapter')}</h2>
        {analysis.chapters.length === 0 ? (
          <p className="text-sm text-gray-400">{t('common.noChapters')}</p>
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
                      {t('projects.words', { count: chapter.words, n: chapter.words.toLocaleString(locale) })} · {formatReadingTime(chapter.readingMinutes)}
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-100 p-3 dark:border-gray-700">
                      <MetricGrid analysis={chapter} />
                      <CollapsibleSection title={t('analysis.keywords')} count={chapter.keywords.length}>
                        <KeywordList keywords={chapter.keywords} />
                      </CollapsibleSection>
                      <CollapsibleSection title={t('analysis.tagsPresent')} count={chapter.tags.length}>
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
