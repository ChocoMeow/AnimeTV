/**
 * Web Speech API + speech language preference (settings / localStorage).
 * Default lang: auto (browser / <html lang>).
 */

const SPEECH_LANG_KEY = 'speechLang'

export const SPEECH_LANG_OPTIONS = [
    { value: 'auto', label: '跟隨瀏覽器' },
    { value: 'zh-TW', label: '繁體中文（台灣）' },
    { value: 'zh-HK', label: '繁體中文（香港）' },
    { value: 'zh-CN', label: '簡體中文' },
    { value: 'en-US', label: 'English (US)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'ja-JP', label: '日本語' },
    { value: 'ko-KR', label: '한국어' },
]

const ALLOWED = new Set(SPEECH_LANG_OPTIONS.map((o) => o.value))
const DEFAULT_LANG = 'auto'

const ERRORS = {
    'not-allowed': '請允許瀏覽器使用麥克風以進行語音搜尋',
    'service-not-allowed': '語音服務無法使用，請稍後再試',
    network: '語音辨識需要網路連線',
    'audio-capture': '無法擷取麥克風音訊',
}

function readStoredLang() {
    if (!import.meta.client || typeof localStorage === 'undefined') return DEFAULT_LANG
    const v = localStorage.getItem(SPEECH_LANG_KEY)
    return ALLOWED.has(v) ? v : DEFAULT_LANG
}

export function getSpeechLang() {
    return readStoredLang()
}

export function useSpeechLang() {
    const speechLang = ref(readStoredLang())

    function setSpeechLang(value) {
        const v = ALLOWED.has(value) ? value : DEFAULT_LANG
        speechLang.value = v
        if (!import.meta.client) return
        if (v === DEFAULT_LANG) localStorage.removeItem(SPEECH_LANG_KEY)
        else localStorage.setItem(SPEECH_LANG_KEY, v)
    }

    onMounted(() => {
        speechLang.value = readStoredLang()
    })

    return { speechLang, setSpeechLang, options: SPEECH_LANG_OPTIONS }
}

function SpeechCtor() {
    if (!import.meta.client) return null
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

/** Resolve recognition language; null = leave unset (UA / page default). */
function resolveLang(lang) {
    if (lang && lang !== 'auto') return lang
    const fromNav = typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])
    if (fromNav) return fromNav
    const fromHtml = typeof document !== 'undefined' && document.documentElement?.lang
    if (fromHtml) return fromHtml
    return null
}

export function useSpeechRecognition({ onResult, onError } = {}) {
    const isListening = ref(false)
    const isSupported = ref(!!SpeechCtor())
    let recognition = null

    onMounted(() => {
        isSupported.value = !!SpeechCtor()
    })

    function fail(message) {
        onError?.(message)
        return false
    }

    function destroy() {
        if (!recognition) {
            isListening.value = false
            return
        }
        try {
            recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null
            recognition.abort()
        } catch {
            /* ignore */
        }
        recognition = null
        isListening.value = false
    }

    async function ensureMic() {
        if (!navigator.mediaDevices?.getUserMedia) return true
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            stream.getTracks().forEach((t) => t.stop())
            return true
        } catch (err) {
            const name = err?.name || ''
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') fail(ERRORS['not-allowed'])
            else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') fail('找不到可用的麥克風裝置')
            else fail('無法存取麥克風，請檢查裝置權限')
            return false
        }
    }

    function stop() {
        if (!recognition) {
            isListening.value = false
            return
        }
        try {
            recognition.stop()
        } catch {
            destroy()
        }
    }

    async function start() {
        const Ctor = SpeechCtor()
        if (!Ctor) return fail('此瀏覽器不支援語音輸入')
        if (!(await ensureMic())) return false

        destroy()
        recognition = new Ctor()
        const resolved = resolveLang(getSpeechLang())
        if (resolved) recognition.lang = resolved
        recognition.interimResults = true
        recognition.continuous = false
        recognition.maxAlternatives = 1

        recognition.onstart = () => {
            isListening.value = true
        }
        recognition.onresult = (event) => {
            let text = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
                text += event.results[i][0]?.transcript || ''
            }
            text = text.trim()
            if (text) onResult?.(text)
        }
        recognition.onerror = (event) => {
            const code = event?.error
            isListening.value = false
            if (code === 'aborted' || code === 'no-speech') return
            fail(ERRORS[code] || '語音辨識失敗，請再試一次')
        }
        recognition.onend = () => {
            isListening.value = false
            recognition = null
        }

        try {
            recognition.start()
            return true
        } catch {
            destroy()
            return fail('無法啟動語音辨識')
        }
    }

    async function toggle() {
        if (isListening.value) {
            stop()
            return false
        }
        return start()
    }

    onUnmounted(destroy)

    return { isSupported, isListening, start, stop, toggle }
}
