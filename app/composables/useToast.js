const toastState = ref({
    message: '',
    type: 'success', // success, error, info, warning
    show: false
})

export const useToast = () => {
    const showToast = (message, type = 'success', duration = 3000) => {
        toastState.value = {
            message,
            type,
            show: true
        }

        setTimeout(() => {
            toastState.value.show = false
        }, duration)
    }

    const hideToast = () => {
        toastState.value.show = false
    }

    return {
        toastState: readonly(toastState),
        showToast,
        hideToast
    }
}