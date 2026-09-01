/** Shared open state for the search panel (SiteHeader + MobileBottomNav). mode: 'search' | 'ai' */
export function useMobileSearchState() {
    const searchModalOpen = useState('app-search-modal-open', () => false)
    const searchModalMode = useState('app-search-modal-mode', () => 'search')

    function openSearchModal(mode = 'search') {
        searchModalMode.value = mode === 'ai' ? 'ai' : 'search'
        searchModalOpen.value = true
    }

    return { searchModalOpen, searchModalMode, openSearchModal }
}
