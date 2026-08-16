/**
 * Prefer native View Transitions when available — they snapshot the old page
 * before DOM updates (correct fade-out → fade-in). Disable Vue pageTransition
 * in that case so the two systems don't fight.
 * https://nuxt.com/docs/4.x/getting-started/transitions#view-transitions-api-experimental
 */
export default defineNuxtRouteMiddleware((to) => {
    if (import.meta.server || !document.startViewTransition) return
    to.meta.pageTransition = false
})
