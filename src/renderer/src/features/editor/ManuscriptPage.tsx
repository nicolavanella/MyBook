import { Navigate } from 'react-router-dom'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import ChapterTree from '@renderer/features/chapters/ChapterTree'
import SceneEditor from './SceneEditor'
import CollapsibleSidebar from '@renderer/components/CollapsibleSidebar'

export default function ManuscriptPage(): JSX.Element {
  const { activeProjectId } = useProjectStore()

  // Nessun progetto attivo: reindirizza sempre a Progetti invece di mostrare
  // qui una lista duplicata — evita anche il "vicolo cieco" per cui da
  // Info/Impostazioni non si riusciva più a tornare alla selezione progetto.
  if (!activeProjectId) return <Navigate to="/projects" replace />

  return (
    <div className="flex h-full">
      <CollapsibleSidebar width={288}>
        <ChapterTree projectId={activeProjectId} />
      </CollapsibleSidebar>
      <div className="flex-1 overflow-auto">
        <SceneEditor />
      </div>
    </div>
  )
}
