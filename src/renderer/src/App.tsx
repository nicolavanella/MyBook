import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'

// Ogni pagina è nel proprio chunk: la prima finestra dell'app carica solo
// bootstrap + editor (rotta di default), non tutte le pagine assieme
// (React Flow per la mindmap, in particolare, pesa parecchio da sola).
const ManuscriptPage = lazy(() => import('./features/editor/ManuscriptPage'))
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage'))
const CharactersPage = lazy(() => import('./features/characters/CharactersPage'))
const LocationsPage = lazy(() => import('./features/locations/LocationsPage'))
const ObjectsPage = lazy(() => import('./features/objects/ObjectsPage'))
const TimelinePage = lazy(() => import('./features/timeline/TimelinePage'))
const MindmapPage = lazy(() => import('./features/mindmap/MindmapPage'))
const StatisticsPage = lazy(() => import('./features/statistics/StatisticsPage'))
const ExportPage = lazy(() => import('./features/export/ExportPage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))
const InfoPage = lazy(() => import('./features/info/InfoPage'))

function PageFallback(): JSX.Element {
  return <div className="p-6 text-sm text-gray-400">Caricamento…</div>
}

export default function App(): JSX.Element {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<ManuscriptPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/objects" element={<ObjectsPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/mindmap" element={<MindmapPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/info" element={<InfoPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
