import { create } from 'zustand'

/**
 * Ephemeral cross-component state for the fine-art product page: the picker
 * (client) publishes the selected family + SIZE + frame colour here, and the hero
 * (client) reads it to show the matching per-size room mockup. Not persisted.
 */
interface FineArtPreviewState {
  family: string | null
  size: string | null
  color: string | null
  setSelection: (family: string | null, size: string | null, color: string | null) => void
}

export const useFineArtPreview = create<FineArtPreviewState>((set) => ({
  family: null,
  size: null,
  color: null,
  setSelection: (family, size, color) => set({ family, size, color }),
}))
