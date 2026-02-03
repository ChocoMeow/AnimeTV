export function useAnimeTooltip() {
    const { isMobile } = useMobile()
    
    const hoveredAnime = ref(null)
    const animeDetails = ref(null)
    const tooltipLoading = ref(false)
    const tooltipError = ref(null)
    const tooltipPosition = ref({ x: 0, y: 0, placement: "top" })
    
    let hoverTimer = null
    
    // Cache for anime details
    const animeCache = ref(new Map())
    
    function calculateTooltipPosition(event) {
        const rect = event.currentTarget.getBoundingClientRect()
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
    
    async function handleMouseEnter(item, event) {
        if (isMobile.value) return
        
        const refId = item.refId || item.id
        hoveredAnime.value = refId
        tooltipPosition.value = calculateTooltipPosition(event)
        tooltipError.value = null
        
        // Check cache first
        if (animeCache.value.has(refId)) {
            animeDetails.value = animeCache.value.get(refId)
            return
        }
        
        hoverTimer = setTimeout(async () => {
            if (hoveredAnime.value === refId) {
                tooltipLoading.value = true
                tooltipError.value = null
                try {
                    const details = await $fetch(`/api/anime/${refId}`)
                    if (hoveredAnime.value === refId) {
                        animeDetails.value = details
                        // Cache the result
                        animeCache.value.set(refId, details)
                    }
                } catch (err) {
                    console.error("Failed to fetch anime details:", err)
                    if (hoveredAnime.value === refId) {
                        tooltipError.value = "無法載入動畫詳情"
                    }
                } finally {
                    tooltipLoading.value = false
                }
            }
        }, 500)
    }
    
    function handleMouseLeave() {
        if (hoverTimer) {
            clearTimeout(hoverTimer)
            hoverTimer = null
        }
        hoveredAnime.value = null
        animeDetails.value = null
        tooltipLoading.value = false
        tooltipError.value = null
    }
    
    function cleanup() {
        if (hoverTimer) {
            clearTimeout(hoverTimer)
        }
    }
    
    return {
        hoveredAnime,
        animeDetails,
        tooltipLoading,
        tooltipError,
        tooltipPosition,
        handleMouseEnter,
        handleMouseLeave,
        cleanup,
    }
}
