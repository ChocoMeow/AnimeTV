export function useAnimeTooltip() {
    const { isMobile } = useMobile()
    
    const hoveredAnime = ref(null)
    const animeDetails = ref(null)
    const tooltipLoading = ref(false)
    const tooltipError = ref(null)
    const tooltipPosition = ref({ x: 0, y: 0, placement: "top" })
    
    let hoverTimer = null
    let leaveTimer = null
    const tooltipHovered = ref(false)
    const anchorElement = ref(null)
    
    const animeCache = ref(new Map())
    
    function calculatePositionFromRect(rect) {
        const tooltipWidth = 360
        const tooltipHeight = 400
        const padding = 16
        
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        
        let x = rect.left + rect.width / 2
        let y = rect.top
        let placement = "top"
        
        const spaceTop = rect.top
        const spaceBottom = viewportHeight - rect.bottom
        const spaceLeft = rect.left
        const spaceRight = viewportWidth - rect.right
        
        // Determine best placement based on available space
        if (spaceTop >= tooltipHeight + padding) {
            placement = "top"
            y = rect.top
            x = rect.left + rect.width / 2
        } else if (spaceBottom >= tooltipHeight + padding) {
            placement = "bottom"
            y = rect.bottom
            x = rect.left + rect.width / 2
        } else if (spaceRight >= tooltipWidth + padding) {
            placement = "right"
            x = rect.right
            y = rect.top + rect.height / 2
        } else if (spaceLeft >= tooltipWidth + padding) {
            placement = "left"
            x = rect.left
            y = rect.top + rect.height / 2
        } else {
            // Default to top if no good space
            placement = "top"
            y = rect.top
            x = rect.left + rect.width / 2
        }
        
        // Adjust horizontal position for top/bottom placements
        if (placement === "top" || placement === "bottom") {
            const halfTooltipWidth = tooltipWidth / 2
            if (x - halfTooltipWidth < padding) {
                x = halfTooltipWidth + padding
            } else if (x + halfTooltipWidth > viewportWidth - padding) {
                x = viewportWidth - halfTooltipWidth - padding
            }
        }
        
        // Adjust vertical position for left/right placements
        if (placement === "left" || placement === "right") {
            const halfTooltipHeight = tooltipHeight / 2
            if (y - halfTooltipHeight < padding) {
                y = halfTooltipHeight + padding
            } else if (y + halfTooltipHeight > viewportHeight - padding) {
                y = viewportHeight - halfTooltipHeight - padding
            }
        }
        
        return { x, y, placement }
    }
    
    function calculateTooltipPosition(event) {
        const rect = event.currentTarget.getBoundingClientRect()
        return calculatePositionFromRect(rect)
    }
    
    function updatePositionFromAnchor() {
        if (!anchorElement.value?.getBoundingClientRect || !hoveredAnime.value) return
        const rect = anchorElement.value.getBoundingClientRect()
        tooltipPosition.value = calculatePositionFromRect(rect)
    }
    
    async function handleMouseEnter(item, event) {
        if (isMobile.value) return
        
        if (leaveTimer) {
            clearTimeout(leaveTimer)
            leaveTimer = null
        }
        if (hoverTimer) {
            clearTimeout(hoverTimer)
            hoverTimer = null
        }
        
        const refId = item.refId || item.id
        const episodeCount = item.episode ?? item.episodes ?? null
        const previousRefId = hoveredAnime.value
        hoveredAnime.value = refId
        anchorElement.value = event.currentTarget
        tooltipPosition.value = calculateTooltipPosition(event)
        tooltipError.value = null
        
        if (animeCache.value.has(refId)) {
            const cached = animeCache.value.get(refId)
            animeDetails.value = { ...cached, episodeCount: cached.episodeCount ?? episodeCount ?? null }
            return
        }
        if (previousRefId !== refId) {
            animeDetails.value = null
            tooltipLoading.value = true
        }
        const delay = previousRefId !== refId ? 100 : 500
        hoverTimer = setTimeout(async () => {
            if (hoveredAnime.value !== refId) return
            tooltipLoading.value = true
            tooltipError.value = null
            try {
                const details = await $fetch(`/api/anime/${refId}`)
                const enrichedDetails = {
                    ...details,
                    episodeCount: details.episodeCount ?? episodeCount ?? null,
                }
                if (hoveredAnime.value === refId) {
                    animeDetails.value = enrichedDetails
                    animeCache.value.set(refId, enrichedDetails)
                }
            } catch (err) {
                console.error("Failed to fetch anime details:", err)
                if (hoveredAnime.value === refId) {
                    tooltipError.value = "無法載入動畫詳情"
                }
            } finally {
                tooltipLoading.value = false
            }
        }, delay)
    }
    
    function clearTooltip() {
        hoveredAnime.value = null
        animeDetails.value = null
        tooltipLoading.value = false
        tooltipError.value = null
        anchorElement.value = null
        tooltipHovered.value = false
    }
    
    function handleMouseLeave() {
        if (tooltipHovered.value) return
        if (leaveTimer) {
            clearTimeout(leaveTimer)
            leaveTimer = null
        }
        leaveTimer = setTimeout(() => {
            leaveTimer = null
            if (hoverTimer) {
                clearTimeout(hoverTimer)
                hoverTimer = null
            }
            clearTooltip()
        }, 200)
    }
    
    function handleTooltipEnter() {
        if (leaveTimer) {
            clearTimeout(leaveTimer)
            leaveTimer = null
        }
        tooltipHovered.value = true
    }
    
    function handleTooltipLeave() {
        tooltipHovered.value = false
        if (hoverTimer) {
            clearTimeout(hoverTimer)
            hoverTimer = null
        }
        clearTooltip()
    }
    
    function setFavoriteStatus(refId, isFavorite) {
        if (animeDetails.value?.refId === refId) {
            animeDetails.value = { ...animeDetails.value, isFavorite }
        }
        const cached = animeCache.value.get(refId)
        if (cached) {
            animeCache.value.set(refId, { ...cached, isFavorite })
        }
    }
    
    onMounted(() => {
        window.addEventListener("scroll", updatePositionFromAnchor, true)
        window.addEventListener("resize", updatePositionFromAnchor)
    })
    onUnmounted(() => {
        window.removeEventListener("scroll", updatePositionFromAnchor, true)
        window.removeEventListener("resize", updatePositionFromAnchor)
    })
    
    function cleanup() {
        if (hoverTimer) clearTimeout(hoverTimer)
        if (leaveTimer) clearTimeout(leaveTimer)
        hoverTimer = null
        leaveTimer = null
    }
    
    return {
        hoveredAnime,
        animeDetails,
        tooltipLoading,
        tooltipError,
        tooltipPosition,
        handleMouseEnter,
        handleMouseLeave,
        handleTooltipEnter,
        handleTooltipLeave,
        setFavoriteStatus,
        cleanup,
    }
}
