/**
 * Shared open state for the anime search modal (SiteHeader + MobileBottomNav).
 * mode: 'search' | 'ai'
 */
export function useMobileSearchState() {
    const searchModalOpen = useState('app-search-modal-open', () => false)
    const searchModalMode = useState('app-search-modal-mode', () => 'search')
    /** @deprecated Use searchModalOpen — kept for callers mid-migration */
    const mobileSearchOpen = searchModalOpen

    function openSearchModal(mode = 'search') {
        searchModalMode.value = mode === 'ai' ? 'ai' : 'search'
        searchModalOpen.value = true
    }

    return { searchModalOpen, searchModalMode, mobileSearchOpen, openSearchModal }
}
