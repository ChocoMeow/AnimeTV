/**
 * Shared open state for the full-screen mobile search overlay (SiteHeader + MobileBottomNav).
 */
export function useMobileSearchState() {
    const mobileSearchOpen = useState("app-mobile-search-open", () => false)
    return { mobileSearchOpen }
}
