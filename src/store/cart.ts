import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CartItemType = 'digital' | 'print' | 'fine-art'

export interface CartItem {
  sku: string
  photoSlug: string
  photoTitle: string
  productLabel: string
  price: number
  currency: string
  priceText: string
  type: CartItemType
  thumbnailUrl?: string
  downloadToken?: string
  format?: 'jpeg' | 'tiff'
  /** Poster-only: customer chose the black-and-white print master. */
  bw?: boolean
}

interface CartState {
  items: CartItem[]
  isOpen: boolean
  /** Set when "Buy Now" is clicked — cart opens directly at payment step. Cleared on close. */
  buyNowItem: CartItem | null
  addItem: (item: CartItem) => void
  removeItem: (sku: string) => void
  clearCart: () => void
  openCart: () => void
  closeCart: () => void
  /** Open cart at payment step with a single item — skips the cart list. */
  buyNow: (item: CartItem) => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      buyNowItem: null,
      addItem: (item) =>
        set((state) =>
          state.items.some((i) => i.sku === item.sku)
            ? state
            : { items: [...state.items, item] }
        ),
      removeItem: (sku) =>
        set((state) => ({ items: state.items.filter((i) => i.sku !== sku) })),
      clearCart: () => set({ items: [] }),
      openCart: () => set({ isOpen: true, buyNowItem: null }),
      closeCart: () => set({ isOpen: false, buyNowItem: null }),
      buyNow: (item) => set({ isOpen: true, buyNowItem: item }),
    }),
    {
      name: 'gmp-cart',
      // Don't persist UI state — only cart contents
      partialize: (state) => ({ items: state.items }),
    }
  )
)
