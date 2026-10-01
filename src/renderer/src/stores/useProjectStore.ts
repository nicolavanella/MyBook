import { create } from 'zustand'

export interface DocumentNode {
  id: string
  project_id: string
  parent_id: string | null
  node_type: 'chapter' | 'scene' | 'section' | 'prologue' | 'epilogue' | 'group'
  title: string
  subtitle: string
  description: string
  notes: string
  status: 'idea' | 'bozza' | 'revisione' | 'completo'
  order_index: number
  content: string
  word_count: number
  char_count: number
  locked: number
  /** v0.3.9: posizione del cursore nell'ultimo salvataggio — vedi migrazione 021_editor_ui_state.sql. */
  cursor_position?: number
  updated_at?: string
}

interface ProjectState {
  activeProjectId: string | null
  tree: DocumentNode[]
  activeNodeId: string | null
  /** v0.3.6: "vai alla scena dove compare questo tag" — impostato dalle schede Personaggi/Località/Oggetti, consumato una tantum da SceneEditor dopo aver caricato la scena, poi azzerato. */
  pendingTagJump: { entityType: string; entityId: string; occurrenceIndex: number } | null
  setActiveProject: (projectId: string) => Promise<void>
  loadTree: () => Promise<void>
  setActiveNode: (nodeId: string | null) => void
  /**
   * Applica una patch al nodo indicato SOLO nello stato locale (senza un
   * round-trip IPC di ricarica): usata dopo un update() già confermato dal
   * main process, per evitare che il resto della UI (conteggio parole,
   * contenuto alla riselezione della scena, titolo nell'albero) resti
   * "congelato" alla versione precedente fino al prossimo loadTree() esplicito.
   * Questo era il bug alla radice di "la formattazione non si salva" e del
   * conteggio parole/caratteri che non si aggiornava.
   */
  patchNodeLocally: (id: string, patch: Partial<DocumentNode>) => void
  exitProject: () => void
  /** v0.3.6: imposta/azzera la richiesta di "salto" a un'occorrenza di tag; vedi il campo pendingTagJump. */
  setPendingTagJump: (jump: { entityType: string; entityId: string; occurrenceIndex: number } | null) => void
}

/**
 * v0.3.9: id del progetto per cui l'ultima scena aperta è già stata
 * ripristinata in questa sessione. Serve a farlo UNA volta sola per
 * apertura di progetto: senza, ogni loadTree() successivo (se ne fanno
 * dopo quasi ogni modifica) riselezionerebbe la scena anche dopo che
 * l'utente l'ha deselezionata di proposito.
 */
let lastSceneRestoredFor: string | null = null

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeProjectId: typeof window !== 'undefined' ? window.localStorage.getItem('mybook.activeProjectId') : null,
  tree: [],
  activeNodeId: null,
  pendingTagJump: null,

  setActiveProject: async (projectId) => {
    lastSceneRestoredFor = null
    set({ activeProjectId: projectId, activeNodeId: null })
    window.localStorage.setItem('mybook.activeProjectId', projectId)
    window.mybook.projects.touch(projectId) // traccia "ultima apertura" per le card in Progetti
    await get().loadTree()
  },

  loadTree: async () => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const tree = await window.mybook.documents.tree(activeProjectId)
      set({ tree })
      // v0.3.9: alla prima apertura del progetto, riseleziona l'ultima scena
      // su cui si stava lavorando (se esiste ancora) — SceneEditor poi
      // riposiziona il cursore dov'era (vedi cursor_position).
      if (lastSceneRestoredFor !== activeProjectId) {
        lastSceneRestoredFor = activeProjectId
        const uiState = await window.mybook.projects.getUiState(activeProjectId)
        const lastSceneId = typeof uiState.lastSceneId === 'string' ? uiState.lastSceneId : null
        const isRestorable = lastSceneId && tree.some((n: DocumentNode) => n.id === lastSceneId && (n.node_type === 'scene' || n.node_type === 'section'))
        if (isRestorable && get().activeNodeId === null && get().activeProjectId === activeProjectId) {
          set({ activeNodeId: lastSceneId })
        }
      }
    } catch {
      window.localStorage.removeItem('mybook.activeProjectId')
      set({ activeProjectId: null, tree: [], activeNodeId: null })
    }
  },

  setActiveNode: (nodeId) => {
    set({ activeNodeId: nodeId })
    // v0.3.9: ricorda l'ultima scena aperta, per riproporla riaprendo il
    // progetto (vedi MainLayout.tsx). "Fire and forget": non è mai
    // bloccante per l'interazione, e un eventuale fallimento (rarissimo,
    // IPC) non ha conseguenze peggiori di riaprire sull'ultima nota buona.
    const projectId = get().activeProjectId
    if (projectId) void window.mybook.projects.setUiState(projectId, { lastSceneId: nodeId })
  },

  patchNodeLocally: (id, patch) =>
    set((state) => ({
      tree: state.tree.map((n) => (n.id === id ? { ...n, ...patch } : n))
    })),

  exitProject: () => { lastSceneRestoredFor = null; window.localStorage.removeItem('mybook.activeProjectId'); set({ activeProjectId: null, tree: [], activeNodeId: null }) },

  setPendingTagJump: (jump) => set({ pendingTagJump: jump })
}))
