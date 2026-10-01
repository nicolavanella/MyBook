import { useState } from 'react'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'

interface Props {
  width?: number
  children: React.ReactNode
}

/** Pannello laterale con un bordo destro e un pulsante per comprimerlo a icona, per dare più spazio al contenuto principale (editor, dettagli). */
export default function CollapsibleSidebar({ width = 288, children }: Props): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className="relative shrink-0 border-r border-gray-200 transition-all"
      style={{ width: collapsed ? 12 : width }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-3 z-10 rounded-full border border-gray-200 bg-white p-0.5 text-gray-400 shadow-sm hover:text-gray-700"
        title={collapsed ? 'Espandi' : 'Comprimi'}
      >
        {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
      </button>
      {!collapsed && <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden p-3">{children}</div>}
    </div>
  )
}
