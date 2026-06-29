import { create } from 'zustand'

/**
 * Ephemeral cross-component state for the poster product page: the B&W toggle
 * (client hero) publishes here, and the picker reads it when building the cart
 * item so the print master delivered to Prodigi matches what the customer saw.
 * Not persisted — resets on page load.
 */
interface PosterPreviewState {
  bw: boolean
  setBw: (bw: boolean) => void
}

export const usePosterPreview = create<PosterPreviewState>((set) => ({
  bw: false,
  setBw: (bw) => set({ bw }),
}))
