/**
 * Shared anime search query, results, history, and speech mic state.
 */
export function useAnimeSearch() {
    const { searchHistory, userSettings } = useUserSettings()
    const client = useSupabaseClient()
    const user = useSupabaseUser()

    const searchQuery = ref('')
    const searchResults = ref([])
    const loading = ref(false)
    const micError = ref('')
    /** When false, typing does not hit /api/search (used for Ask-AI compose mode). */
    const searchFetchEnabled = ref(true)

    let searchDebounceTimeout = null
    let micErrorTimeout = null

    function clearMicError() {
        if (micErrorTimeout) {
            clearTimeout(micErrorTimeout)
            micErrorTimeout = null
        }
        micError.value = ''
    }

    const { isSupported: speechSupported, isListening, toggle: toggleSpeech, stop: stopSpeech } = useSpeechRecognition({
        onResult: (transcript) => {
            clearMicError()
            searchQuery.value = transcript
        },
        onError: (message) => {
            clearMicError()
            micError.value = message
            micErrorTimeout = setTimeout(clearMicError, 2000)
        },
    })

    function onMicToggle() {
        toggleSpeech()
    }

    function cancelPendingSearch() {
        if (searchDebounceTimeout) {
            clearTimeout(searchDebounceTimeout)
            searchDebounceTimeout = null
        }
    }

    function clearResults() {
        searchResults.value = []
        loading.value = false
    }

    function debouncedSearch() {
        cancelPendingSearch()
        if (!searchFetchEnabled.value || !searchQuery.value.trim()) {
            clearResults()
            return
        }
        loading.value = true
        searchDebounceTimeout = setTimeout(() => {
            fetchSearchSuggestions()
        }, 300)
    }

    function setSearchFetchEnabled(enabled) {
        searchFetchEnabled.value = !!enabled
        if (!enabled) {
            cancelPendingSearch()
            clearResults()
        } else if (searchQuery.value.trim()) {
            debouncedSearch()
        }
    }

    function searchFromHistory(query) {
        searchQuery.value = query
    }

    function resetSearch() {
        stopSpeech()
        clearMicError()
        searchQuery.value = ''
        searchResults.value = []
        loading.value = false
        searchFetchEnabled.value = true
        cancelPendingSearch()
    }

    async function saveSearchHistory(query) {
        if (!userSettings.value.search_history_enabled || !query || !userSettings.value.id) return
        if (searchHistory.value.some((item) => item.query === query)) return

        try {
            const { data, error } = await client
                .from('search_history')
                .insert({
                    user_id: userSettings.value.id,
                    query,
                })
                .select('id, query, created_at')
                .single()

            if (error) throw error

            searchHistory.value.push(data)
            searchHistory.value.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        } catch (err) {
            console.error('Failed to save search history:', err)
        }
    }

    async function removeFromHistory(id) {
        try {
            const { error } = await client.from('search_history').delete().eq('id', id)
            if (error) throw error
            searchHistory.value = searchHistory.value.filter((item) => item.id !== id)
        } catch (err) {
            console.error('Failed to remove search history:', err)
        }
    }

    async function fetchSearchHistory() {
        if (!userSettings.value.id) {
            searchHistory.value = []
            return
        }

        try {
            const { data, error } = await client
                .from('search_history')
                .select('id, query, created_at')
                .eq('user_id', userSettings.value.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            searchHistory.value = data || []
        } catch (err) {
            console.error('Failed to fetch search history:', err)
            searchHistory.value = []
        }
    }

    async function fetchSearchSuggestions() {
        if (!searchFetchEnabled.value) {
            searchResults.value = []
            loading.value = false
            return
        }
        if (!searchQuery.value) {
            searchResults.value = []
            return
        }
        loading.value = true
        try {
            const res = await $fetch(`/api/search/${encodeURIComponent(searchQuery.value)}`)
            if (!searchFetchEnabled.value) {
                searchResults.value = []
                return
            }
            searchResults.value = res.results || []
        } catch (err) {
            console.error('Search failed:', err)
            searchResults.value = []
        } finally {
            loading.value = false
        }
    }

    watch(searchQuery, () => {
        debouncedSearch()
    })

    watch(user, (newUser) => {
        if (newUser) fetchSearchHistory()
        else searchHistory.value = []
    })

    onMounted(() => {
        fetchSearchHistory()
    })

    onUnmounted(() => {
        clearMicError()
        stopSpeech()
        cancelPendingSearch()
    })

    return {
        searchQuery,
        searchResults,
        loading,
        searchHistory,
        micError,
        speechSupported,
        isListening,
        searchFetchEnabled,
        onMicToggle,
        stopSpeech,
        clearMicError,
        searchFromHistory,
        saveSearchHistory,
        removeFromHistory,
        fetchSearchHistory,
        resetSearch,
        setSearchFetchEnabled,
    }
}
