/**
 * Shared open state for the full-screen mobile search overlay (SiteHeader + MobileBottomNav).
 */
export function useMobileSearchState() {
    const mobileSearchOpen = useState("animehub-mobile-search-open", () => false)
    return { mobileSearchOpen }
}
