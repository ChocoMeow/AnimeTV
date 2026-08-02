/**
 * Prefetch upcoming HLS segments in parallel.
 * Window size adapts to measured download-vs-playback speed (not a fixed count).
 */
export function createParallelFragLoader(Hls, { minAhead = 1, maxAhead = 6 } = {}) {
    const BaseLoader = Hls.DefaultConfig.loader
    const pending = new Map()
    const samples = [] // recent downloadMs / mediaSec ratios
    const SAMPLE_LIMIT = 8

    function clamp(n, lo, hi) {
        return Math.min(hi, Math.max(lo, n))
    }

    function recordSample(bytes, downloadMs, mediaSec) {
        if (!(bytes > 0 && downloadMs > 0 && mediaSec > 0)) return
        samples.push(downloadMs / (mediaSec * 1000))
        if (samples.length > SAMPLE_LIMIT) samples.shift()
    }

    /** How many segments to keep warm so downloads stay ahead of realtime. */
    function currentAhead() {
        if (samples.length) {
            const ratio = samples.reduce((sum, r) => sum + r, 0) / samples.length
            // ratio 0.4 → ~2; ratio 1.5 → ~3; +1 headroom, clamped
            return clamp(Math.ceil(ratio + 1), minAhead, maxAhead)
        }

        const net = typeof navigator !== 'undefined' ? navigator.connection : null
        const type = net?.effectiveType
        if (type === 'slow-2g' || type === '2g') return maxAhead
        if (type === '3g') return clamp(4, minAhead, maxAhead)
        if (typeof net?.downlink === 'number' && net.downlink > 0) {
            if (net.downlink < 1.5) return clamp(4, minAhead, maxAhead)
            if (net.downlink >= 10) return clamp(2, minAhead, maxAhead)
        }
        return clamp(2, minAhead, maxAhead)
    }

    function warm(frag) {
        const url = frag?.url
        if (!url || pending.has(url)) return
        const mediaSec = Number(frag.duration) || 0
        const started = performance.now()
        const promise = fetch(url)
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data = await res.arrayBuffer()
                const ended = performance.now()
                recordSample(data.byteLength, ended - started, mediaSec)
                return { data, url: res.url || url, started, ended }
            })
            .catch((err) => {
                pending.delete(url)
                throw err
            })
        pending.set(url, { promise, started })
    }

    function warmAhead(fragments, fromIndex = 0) {
        if (!fragments?.length) return
        const start = Math.max(0, fromIndex)
        const end = Math.min(fragments.length, start + currentAhead())
        for (let i = start; i < end; i++) warm(fragments[i])
    }

    function clear() {
        pending.clear()
    }

    function reset() {
        pending.clear()
        samples.length = 0
    }

    class ParallelFragLoader extends BaseLoader {
        load(context, config, callbacks) {
            const entry = pending.get(context.url)
            if (!entry) {
                super.load(context, config, callbacks)
                return
            }

            this.context = context
            this.config = config
            this.callbacks = callbacks

            entry.promise
                .then((result) => {
                    pending.delete(context.url)
                    if (this.stats.aborted) return
                    this.stats.loading.start = result.started
                    this.stats.loading.first = result.started
                    this.stats.loading.end = result.ended
                    this.stats.loaded = result.data.byteLength
                    this.stats.total = result.data.byteLength
                    callbacks.onSuccess({ url: result.url, data: result.data }, this.stats, context, null)
                })
                .catch(() => {
                    pending.delete(context.url)
                    if (this.stats.aborted) return
                    super.load(context, config, callbacks)
                })
        }

        abort() {
            if (this.loader) {
                super.abort()
                return
            }
            this.stats.aborted = true
            this.callbacks?.onAbort?.(this.stats, this.context, null)
        }
    }

    return { FragLoader: ParallelFragLoader, warmAhead, clear, reset }
}
