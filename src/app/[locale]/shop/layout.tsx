import ShopNavigationOverlay from '../../components/ShopNavigationOverlay'

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <ShopNavigationOverlay>{children}</ShopNavigationOverlay>
}
