/**
 * Prefetch upcoming HLS segments with a sliding concurrency window.
 * As soon as one download finishes, the next segment starts — no batch
 * barrier. The window size adapts to the live download-speed vs
 * playback-speed ratio (EMA), so slow connections buffer further ahead
 * and fast ones don't waste bandwidth fetching too early.
 *
 * Cancellation is real: seeking past a prefetched segment, or hls.js
 * aborting a load, cancels the underlying fetch instead of letting it
 * finish uselessly in the background and hog bandwidth.
 */
export function createParallelFragLoader(Hls, { minAhead = 1, maxAhead = 6 } = {}) {
    const BaseLoader = Hls.DefaultConfig.loader
    const pending = new Map() // url -> { promise, index, controller }

    let speedRatio = null // EMA of downloadMs / (mediaSec * 1000)
    let fragments = []
    let cursor = 0
    let inFlight = 0

    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

    function currentAhead() {
        const ratio = speedRatio ?? 0.5 // sane guess until we have real data
        return clamp(Math.ceil(ratio + 1), minAhead, maxAhead)
    }

    function recordSample(bytes, downloadMs, mediaSec) {
        if (!(bytes > 0 && downloadMs > 0 && mediaSec > 0)) return
        const ratio = downloadMs / (mediaSec * 1000)
        speedRatio = speedRatio == null ? ratio : speedRatio + (ratio - speedRatio) * 0.3
    }

    // Only removes the map entry if it's still the one we think it is —
    // guards against a same-URL entry that was aborted and re-warmed
    // in between this fetch settling and us getting here.
    function dropIfCurrent(url, entry) {
        if (pending.get(url) === entry) pending.delete(url)
    }

    function abortEntry(url, entry) {
        pending.delete(url)
        entry.controller.abort()
    }

    function warm(frag, index) {
        const url = frag?.url
        if (!url || pending.has(url)) return

        const controller = new AbortController()
        const mediaSec = Number(frag.duration) || 0
        const started = performance.now()
        const entry = { index, controller }
        pending.set(url, entry)
        inFlight++

        entry.promise = fetch(url, { signal: controller.signal })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data = await res.arrayBuffer()
                const ended = performance.now()
                recordSample(data.byteLength, ended - started, mediaSec)
                return { data, url: res.url || url, started, ended }
            })
            .catch((err) => {
                dropIfCurrent(url, entry)
                throw err
            })
            .finally(() => {
                inFlight--
                pump()
            })
    }

    function pump() {
        const limit = currentAhead()
        while (inFlight < limit && cursor < fragments.length) {
            warm(fragments[cursor], cursor)
            cursor++
        }
    }

    /** Start/continue prefetching from fromIndex. Cancels any pending
     *  fetch the playhead has skipped past (forward seek) so its
     *  bandwidth goes to what's actually needed next. */
    function warmAhead(newFragments, fromIndex = 0) {
        if (!newFragments?.length) return
        fragments = newFragments

        for (const [url, entry] of pending) {
            if (entry.index < fromIndex) abortEntry(url, entry)
        }

        cursor = Math.max(cursor, fromIndex, 0)
        pump()
    }

    function clear() {
        for (const [url, entry] of pending) abortEntry(url, entry)
        fragments = []
        cursor = 0
    }

    function reset() {
        clear()
        speedRatio = null
    }

    class ParallelFragLoader extends BaseLoader {
        load(context, config, callbacks) {
            const entry = pending.get(context.url)
            if (!entry) {
                super.load(context, config, callbacks)
                return
            }

            this.context = context
            this.callbacks = callbacks

            entry.promise
                .then((result) => {
                    dropIfCurrent(context.url, entry)
                    if (this.stats.aborted) return
                    Object.assign(this.stats.loading, {
                        start: result.started,
                        first: result.started,
                        end: result.ended,
                    })
                    this.stats.loaded = this.stats.total = result.data.byteLength
                    callbacks.onSuccess({ url: result.url, data: result.data }, this.stats, context, null)
                })
                .catch(() => {
                    dropIfCurrent(context.url, entry)
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
            const entry = this.context && pending.get(this.context.url)
            if (entry) abortEntry(this.context.url, entry)
            this.callbacks?.onAbort?.(this.stats, this.context, null)
        }
    }

    return { FragLoader: ParallelFragLoader, warmAhead, clear, reset }
}