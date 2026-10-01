import { create } from 'zustand'

export type EntityTagType = 'character' | 'location' | 'object' | 'event'

interface EntityNavigationState {
  pending: { type: EntityTagType; id: string } | null
  requestSelect: (type: EntityTagType, id: string) => void
  consume: () => void
}

/**
 * Ponte minimo tra il click su un tag nell'editor (SceneEditor.tsx) e la
 * pagina di destinazione (Personaggi/Località/Oggetti/Timeline): quest'ultima
 * legge `pending` una volta caricata la propria lista e, se coincide,
 * seleziona l'elemento e chiama `consume()`. Un semplice store globale
 * evita di dover passare l'informazione attraverso il router.
 */
export const useEntityNavigationStore = create<EntityNavigationState>((set) => ({
  pending: null,
  requestSelect: (type, id) => set({ pending: { type, id } }),
  consume: () => set({ pending: null })
}))
