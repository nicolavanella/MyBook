import { useEffect, useState } from 'react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import type { ProjectStatistics } from '@shared/ipc/channels'
import AnalysisTab from './AnalysisTab'
import type { TranslationKey } from '@shared/i18n'
import { useTranslation } from '@renderer/i18n/useTranslation'

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  idea: 'status.idea',
  bozza: 'status.bozza',
  revisione: 'status.revisione',
  completo: 'status.completo'
}

export default function StatisticsPage(): JSX.Element {
  const { t, locale } = useTranslation()
  const { activeProjectId } = useProjectStore()
  const [stats, setStats] = useState<ProjectStatistics | null>(null)
  // v0.3.5: due schede, "Principale" (comportamento storico) e "Analisi" (nuova).
  // v0.3.7: la scheda Log è stata spostata in Impostazioni (tra Editor e Avanzate).
  const [tab, setTab] = useState<'principale' | 'analisi'>('principale')

  useEffect(() => {
    if (!activeProjectId) return
    window.mybook.statistics.get(activeProjectId).then(setStats)
  }, [activeProjectId])

  if (!activeProjectId) return <div className="p-6 text-sm text-gray-400">{t('common.openProject')}</div>

  const tabButton = (value: typeof tab, label: string): JSX.Element => (
    <button
      onClick={() => setTab(value)}
      className={`border-b-2 px-3 py-2 text-sm font-medium ${
        tab === value
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  )

  // v0.3.6: la barra delle schede va mostrata subito, prima ancora che le
  // statistiche della tab Principale siano arrivate — altrimenti chi apre le
  // schede Analisi o Log (che caricano i propri dati per conto proprio)
  // resterebbe bloccato dietro un semplice "Caricamento…" della Principale.
  const cards = stats
    ? [
        { label: t('statistics.totalWords'), value: stats.totalWords.toLocaleString(locale) },
        {
          label: t('statistics.totalChars'),
          value: `${stats.totalCharsWithoutSpaces.toLocaleString(locale)} / ${stats.totalChars.toLocaleString(locale)}`
        }
      ]
    : []

  return (
    <div className="p-6">
      <h1 className="mb-2 text-xl font-semibold">{t('nav.statistics')}</h1>
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabButton('principale', t('statistics.tab.main'))}
        {tabButton('analisi', t('statistics.tab.analysis'))}
      </div>

      {tab === 'analisi' ? (
        <AnalysisTab projectId={activeProjectId} />
      ) : !stats ? (
        <div className="text-sm text-gray-400">{t('common.loading')}</div>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded border border-gray-200 p-4">
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="text-sm text-gray-500">{c.label}</div>
          </div>
        ))}
        {/*
          v0.3.8: "Scene completate" ora mostra anche Capitoli completati/
          totali, oltre a Scene completate/totali e alla percentuale, con il
          riquadro colorato come una barra di avanzamento: un riempimento
          (width = completionPct%) dietro il testo, invece di un semplice
          numero. Il colore passa da ambra a verde oltre la metà, per un
          colpo d'occhio più immediato del semplice testo.
        */}
        <div className="relative overflow-hidden rounded border border-gray-200 p-4">
          <div
            className={`absolute inset-y-0 left-0 ${stats.completionPct >= 50 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}
            style={{ width: `${stats.completionPct}%` }}
            aria-hidden="true"
          />
          <div className="relative">
            <div className="text-2xl font-semibold">{stats.completionPct}%</div>
            <div className="text-sm text-gray-500">
              {t('statistics.completion', { chaptersDone: stats.chaptersCompleted, chaptersTotal: stats.chaptersTotal, scenesDone: stats.completedNodes, scenesTotal: stats.totalNodes })}
            </div>
          </div>
        </div>
      </div>

      {/* Statistiche generali: data creazione progetto, giorni trascorsi, media parole/giorno */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t('statistics.general')}
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded border border-gray-200 p-4">
          <div className="text-lg font-medium">
            {stats.projectCreatedAt
              ? new Date(stats.projectCreatedAt).toLocaleDateString(locale)
              : '—'}
          </div>
          <div className="text-sm text-gray-500">{t('statistics.createdAt')}</div>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <div className="text-2xl font-semibold">{stats.daysSinceCreation ?? '—'}</div>
          <div className="text-sm text-gray-500">{t('statistics.daysElapsed')}</div>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <div className="text-2xl font-semibold">{stats.avgWordsPerDay ?? '—'}</div>
          <div className="text-sm text-gray-500">{t('statistics.avgWordsPerDay')}</div>
        </div>
      </div>

      {/* Spaccato per capitolo: num scene, lunghezza, stato */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t('statistics.perChapter')}
      </h2>
      {stats.chapters.length === 0 ? (
        <p className="text-sm text-gray-400">{t('common.noChapters')}</p>
      ) : (
        <div className="overflow-hidden rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">{t('statistics.col.chapter')}</th>
                <th className="px-3 py-2">{t('statistics.col.scenes')}</th>
                <th className="px-3 py-2">{t('statistics.col.words')}</th>
                <th className="px-3 py-2">{t('statistics.col.sceneStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.chapters.map((c) => (
                <tr key={c.chapterId} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{c.chapterTitle}</td>
                  <td className="px-3 py-2">{c.sceneCount}</td>
                  <td className="px-3 py-2">{c.wordCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(['idea', 'bozza', 'revisione', 'completo'] as const).map((s) =>
                        c[s] > 0 ? (
                          <span
                            key={s}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                          >
                            {t(STATUS_LABEL_KEYS[s])}: {c[s]}
                          </span>
                        ) : null
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </div>
  )
}
