import { create } from 'zustand'

/**
 * Ephemeral cross-component state for the fine-art product page: the picker
 * (client) publishes the selected family + frame colour here, and the hero
 * (client) reads it to show the matching room mockup. Not persisted — it's just
 * the current on-page selection.
 */
interface FineArtPreviewState {
  family: string | null
  color: string | null
  setSelection: (family: string | null, color: string | null) => void
}

export const useFineArtPreview = create<FineArtPreviewState>((set) => ({
  family: null,
  color: null,
  setSelection: (family, color) => set({ family, color }),
}))
