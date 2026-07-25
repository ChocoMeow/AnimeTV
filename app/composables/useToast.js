const toasts = ref([])
const timers = new Map()

let nextId = 0

const MAX_TOASTS = 3
const TITLES = { success: 'Success', error: 'Error', info: 'Info', warning: 'Warning' }

const remove = (id) => {
    clearTimeout(timers.get(id))
    timers.delete(id)
    toasts.value = toasts.value.filter((t) => t.id !== id)
}

export const useToast = () => {
    const hideToast = (id) => {
        const target = id ?? toasts.value.at(-1)?.id
        if (target != null) remove(target)
    }

    /** showToast(message, type?, duration?) | showToast({ title?, message, type?, duration? }) */
    const showToast = (input, type = 'success', duration = 3000) => {
        const opts = typeof input === 'object' && input ? input : null
        const toastType = opts?.type ?? type
        const id = ++nextId

        while (toasts.value.length >= MAX_TOASTS) remove(toasts.value[0].id)

        toasts.value = [
            ...toasts.value,
            {
                id,
                type: toastType,
                title: opts ? opts.title || TITLES[toastType] : input || TITLES[toastType],
                message: opts?.message || ''
            }
        ]

        timers.set(
            id,
            setTimeout(() => remove(id), opts?.duration ?? duration)
        )
    }

    return { toasts: readonly(toasts), showToast, hideToast }
}
