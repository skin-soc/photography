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
  downloadToken?: string
  format?: 'jpeg' | 'tiff'
}

interface CartState {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (sku: string) => void
  clearCart: () => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((state) =>
          state.items.some((i) => i.sku === item.sku)
            ? state
            : { items: [...state.items, item] }
        ),
      removeItem: (sku) =>
        set((state) => ({ items: state.items.filter((i) => i.sku !== sku) })),
      clearCart: () => set({ items: [] }),
    }),
    { name: 'gmp-cart' }
  )
)
