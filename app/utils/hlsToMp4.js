/**
 * Remux HLS media (fMP4 fragments or MPEG-TS AVC+AAC) into a progressive MP4
 * that native <video src> can play. No third-party libraries.
 *
 * @param {ArrayBuffer[]} parts init segment (if any) followed by media segments
 * @returns {Blob}
 */
export function hlsSegmentsToMp4(parts) {
    if (!parts?.length) throw new Error('沒有可轉檔的片段')
    const buffers = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)))
    const probe = buffers.find((b) => b.byteLength >= 8)
    if (!probe) throw new Error('片段是空的')

    if (isFmp4(probe)) return buildProgressiveMp4(collectFmp4Tracks(buffers))
    if (isMpegTs(probe)) return buildProgressiveMp4(collectTsTracks(buffers))
    throw new Error('不支援的 HLS 片段格式')
}

function isFmp4(bytes) {
    if (bytes.byteLength < 8) return false
    const type = str4(bytes, 4)
    if (type === 'ftyp' || type === 'moof' || type === 'moov' || type === 'sidx' || type === 'styp') return true
    if (bytes[0] === 0x47) return false
    const boxes = readBoxes(bytes)
    return boxes.some((b) => b.type === 'moof' || b.type === 'moov' || b.type === 'ftyp')
}

function isMpegTs(bytes) {
    if (bytes[0] === 0x47 && bytes.byteLength >= 188) return true
    if (bytes.byteLength >= 192 && bytes[4] === 0x47) return true
    return false
}

function str4(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

function concat(chunks) {
    const list = chunks.filter(Boolean)
    let total = 0
    for (const c of list) total += c.byteLength
    const out = new Uint8Array(total)
    let o = 0
    for (const c of list) {
        out.set(c, o)
        o += c.byteLength
    }
    return out
}

function u32(n) {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n >>> 0)
    return b
}

function u16(n) {
    const b = new Uint8Array(2)
    new DataView(b.buffer).setUint16(0, n & 0xffff)
    return b
}

function box(type, payload) {
    const body = payload instanceof Uint8Array ? payload : concat(payload)
    const out = new Uint8Array(8 + body.byteLength)
    out.set(u32(out.byteLength), 0)
    out[4] = type.charCodeAt(0)
    out[5] = type.charCodeAt(1)
    out[6] = type.charCodeAt(2)
    out[7] = type.charCodeAt(3)
    out.set(body, 8)
    return out
}

function fullBox(type, version, flags, payload) {
    const head = new Uint8Array(4)
    head[0] = version
    head[1] = (flags >> 16) & 0xff
    head[2] = (flags >> 8) & 0xff
    head[3] = flags & 0xff
    return box(type, concat([head, payload instanceof Uint8Array ? payload : concat(payload)]))
}

function readBoxes(bytes, start = 0, end = bytes.byteLength) {
    const boxes = []
    let off = start
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    while (off + 8 <= end) {
        let size = view.getUint32(off)
        const type = str4(bytes, off + 4)
        let header = 8
        if (size === 1) {
            if (off + 16 > end) break
            const big = view.getBigUint64(off + 8)
            if (big > BigInt(Number.MAX_SAFE_INTEGER)) break
            size = Number(big)
            header = 16
        } else if (size === 0) {
            size = end - off
        }
        if (size < header || off + size > end) break
        boxes.push({ type, offset: off, size, header, payloadStart: off + header, payloadEnd: off + size, bytes })
        off += size
    }
    return boxes
}

function children(boxNode) {
    return readBoxes(boxNode.bytes, boxNode.payloadStart, boxNode.payloadEnd)
}

function findDeep(boxes, type) {
    for (const b of boxes) {
        if (b.type === type) return b
        if ('moov mvex trak mdia minf stbl edts'.includes(b.type)) {
            const hit = findDeep(children(b), type)
            if (hit) return hit
        }
    }
    return null
}

function walkType(boxes, type, acc = []) {
    for (const b of boxes) {
        if (b.type === type) acc.push(b)
        if ('moov mvex trak mdia minf stbl traf moof'.includes(b.type)) walkType(children(b), type, acc)
    }
    return acc
}

function slicePayload(b) {
    return b.bytes.subarray(b.payloadStart, b.payloadEnd)
}

function sliceBox(b) {
    return b.bytes.subarray(b.offset, b.offset + b.size)
}

function viewAt(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset + offset)
}

function newTrack(id) {
    return {
        id,
        handler: 'vide',
        timescale: 90000,
        width: 0,
        height: 0,
        volume: 0,
        channels: 2,
        sampleRate: 44100,
        stsd: null,
        samples: [],
        defaultDuration: 0,
        defaultSize: 0,
        defaultFlags: 0,
        defaultBaseIsMoof: false,
    }
}

function collectFmp4Tracks(buffers) {
    const tracks = new Map()
    for (const bytes of buffers) {
        const top = readBoxes(bytes)
        const moov = top.find((b) => b.type === 'moov')
        if (moov) parseMoov(moov, tracks)
        for (let i = 0; i < top.length; i++) {
            if (top[i].type !== 'moof') continue
            let mdat = null
            for (let j = i + 1; j < top.length; j++) {
                if (top[j].type === 'mdat') {
                    mdat = top[j]
                    break
                }
                if (top[j].type === 'moof') break
            }
            parseFragment(top[i], mdat, tracks)
        }
    }
    const list = [...tracks.values()].filter((t) => t.samples.length)
    if (!list.length) throw new Error('fMP4 沒有可用樣本')
    return list
}

function parseMoov(moov, tracks) {
    const trexs = walkType(children(moov), 'trex')
    const traks = children(moov).filter((b) => b.type === 'trak')
    for (const trak of traks) {
        const tkhd = findDeep([trak], 'tkhd')
        const mdhd = findDeep([trak], 'mdhd')
        const hdlr = findDeep([trak], 'hdlr')
        const stsd = findDeep([trak], 'stsd')
        if (!tkhd || !mdhd) continue
        const id = readTkhdId(tkhd)
        const track = tracks.get(id) || newTrack(id)
        const tk = parseTkhd(tkhd)
        track.width = tk.width || track.width
        track.height = tk.height || track.height
        track.timescale = readMdhdTimescale(mdhd)
        if (hdlr) {
            const p = slicePayload(hdlr)
            if (p.byteLength >= 12) track.handler = String.fromCharCode(p[8], p[9], p[10], p[11])
        }
        if (stsd) track.stsd = sliceBox(stsd)
        const trex = trexs.find((t) => {
            const p = slicePayload(t)
            return p.byteLength >= 8 && viewAt(p, 0).getUint32(4) === id
        })
        if (trex) {
            const p = slicePayload(trex)
            const v = viewAt(p, 0)
            track.defaultDuration = v.getUint32(12)
            track.defaultSize = v.getUint32(16)
            track.defaultFlags = v.getUint32(20)
        }
        tracks.set(id, track)
    }
}

function readTkhdId(tkhd) {
    const p = slicePayload(tkhd)
    const version = p[0]
    return viewAt(p, 0).getUint32(version === 1 ? 20 : 12)
}

function parseTkhd(tkhd) {
    const p = slicePayload(tkhd)
    const version = p[0]
    const v = viewAt(p, 0)
    const dimOff = version === 1 ? 88 : 76
    return {
        width: dimOff + 4 <= p.byteLength ? v.getUint32(dimOff) >>> 16 : 0,
        height: dimOff + 8 <= p.byteLength ? v.getUint32(dimOff + 4) >>> 16 : 0,
    }
}

function readMdhdTimescale(mdhd) {
    const p = slicePayload(mdhd)
    const version = p[0]
    const v = viewAt(p, 0)
    return v.getUint32(version === 1 ? 20 : 12) || 90000
}

function parseFragment(moof, mdat, tracks) {
    const mdatBytes = mdat ? slicePayload(mdat) : new Uint8Array(0)
    const trafs = children(moof).filter((b) => b.type === 'traf')
    let packed = 0
    for (const traf of trafs) {
        const kids = children(traf)
        const tfhd = kids.find((b) => b.type === 'tfhd')
        if (!tfhd) continue
        const hd = parseTfhd(tfhd)
        const track = tracks.get(hd.trackId) || newTrack(hd.trackId)
        tracks.set(hd.trackId, track)
        const defaultDuration = hd.defaultDuration ?? track.defaultDuration
        const defaultSize = hd.defaultSize ?? track.defaultSize
        const defaultFlags = hd.defaultFlags ?? track.defaultFlags
        const tfdt = kids.find((b) => b.type === 'tfdt')
        let decodeTime = tfdt ? parseTfdt(tfdt) : 0
        const trun = kids.find((b) => b.type === 'trun')
        if (!trun || !mdat) continue
        const run = parseTrun(trun, defaultDuration, defaultSize, defaultFlags)
        const base = hd.baseDataOffset != null ? Number(hd.baseDataOffset) : moof.offset
        let cursor =
            run.dataOffset != null ? base + run.dataOffset - mdat.payloadStart : packed
        for (const sample of run.samples) {
            const start = Math.max(0, cursor)
            const end = Math.min(mdatBytes.byteLength, start + sample.size)
            const data = mdatBytes.subarray(start, end)
            const dependsOn = sampleDependsOn(sample.flags)
            const sync =
                track.handler !== 'vide' ||
                dependsOn === 2 ||
                !track.samples.length ||
                (!(sample.flags & 0x10000) && dependsOn !== 1 && sample.flags !== 0)
            track.samples.push({
                dts: decodeTime,
                cts: sample.cts,
                duration: sample.duration || 1,
                data: data.slice(),
                sync,
            })
            decodeTime += sample.duration || 1
            cursor += sample.size
            packed += sample.size
        }
    }
}

function parseTfhd(tfhd) {
    const p = slicePayload(tfhd)
    const v = viewAt(p, 0)
    const flags = v.getUint32(0) & 0xffffff
    let o = 4
    const trackId = v.getUint32(o)
    o += 4
    const out = { trackId, defaultBaseIsMoof: !!(flags & 0x20000) }
    if (flags & 0x1) {
        out.baseDataOffset = v.getBigUint64(o)
        o += 8
    }
    if (flags & 0x2) o += 4
    if (flags & 0x8) {
        out.defaultDuration = v.getUint32(o)
        o += 4
    }
    if (flags & 0x10) {
        out.defaultSize = v.getUint32(o)
        o += 4
    }
    if (flags & 0x20) out.defaultFlags = v.getUint32(o)
    return out
}

function parseTfdt(tfdt) {
    const p = slicePayload(tfdt)
    const version = p[0]
    const v = viewAt(p, 0)
    return version === 1 ? Number(v.getBigUint64(4)) : v.getUint32(4)
}

function parseTrun(trun, defaultDuration, defaultSize, defaultFlags) {
    const p = slicePayload(trun)
    const v = viewAt(p, 0)
    const flags = v.getUint32(0) & 0xffffff
    const count = v.getUint32(4)
    let o = 8
    let dataOffset = null
    if (flags & 0x1) {
        dataOffset = v.getInt32(o)
        o += 4
    }
    let firstFlags = null
    if (flags & 0x4) {
        firstFlags = v.getUint32(o)
        o += 4
    }
    const samples = []
    for (let i = 0; i < count; i++) {
        const duration = flags & 0x100 ? v.getUint32(o) : defaultDuration
        if (flags & 0x100) o += 4
        const size = flags & 0x200 ? v.getUint32(o) : defaultSize
        if (flags & 0x200) o += 4
        let sflags = defaultFlags
        if (flags & 0x400) {
            sflags = v.getUint32(o)
            o += 4
        } else if (i === 0 && firstFlags != null) sflags = firstFlags
        let cts = 0
        if (flags & 0x800) {
            cts = v.getInt32(o)
            o += 4
        }
        samples.push({ duration, size, flags: sflags, cts })
    }
    return { dataOffset, samples }
}

function sampleDependsOn(flags) {
    return (flags >>> 24) & 0x3
}

function collectTsTracks(buffers) {
    const videoNals = { sps: null, pps: null }
    const videoSamples = []
    const audioSamples = []
    let audioMeta = null
    const pmtPids = new Set()
    let videoPid = null
    let audioPid = null
    const pesBuf = new Map()

    const flushPes = (pid) => {
        const acc = pesBuf.get(pid)
        if (!acc?.length) return
        const pes = concat(acc)
        pesBuf.set(pid, [])
        const parsed = parsePes(pes)
        if (!parsed) return
        if (pid === videoPid) {
            const sample = avcSampleFromAnnexB(parsed.payload, videoNals)
            if (!sample) return
            videoSamples.push({
                dts: parsed.dts ?? parsed.pts ?? 0,
                cts: (parsed.pts ?? parsed.dts ?? 0) - (parsed.dts ?? parsed.pts ?? 0),
                data: sample.data,
                sync: sample.sync,
                duration: 0,
            })
        } else if (pid === audioPid) {
            const frames = splitAdts(parsed.payload)
            for (const frame of frames) {
                if (!audioMeta) audioMeta = frame.meta
                audioSamples.push({
                    dts: parsed.pts ?? parsed.dts ?? 0,
                    cts: 0,
                    data: frame.payload,
                    sync: true,
                    duration: 0,
                })
            }
        }
    }

    for (const bytes of buffers) {
        const packetSize = bytes[0] === 0x47 ? 188 : bytes[4] === 0x47 ? 192 : 0
        if (!packetSize) continue
        const start = packetSize === 192 ? 4 : 0
        for (let i = start; i + 188 <= bytes.byteLength; i += packetSize === 192 ? 192 : 188) {
            if (bytes[i] !== 0x47) continue
            const pid = ((bytes[i + 1] & 0x1f) << 8) | bytes[i + 2]
            const startIndicator = !!(bytes[i + 1] & 0x40)
            const adaptation = (bytes[i + 3] >> 4) & 0x3
            let offset = i + 4
            if (adaptation === 2) continue
            if (adaptation === 3) {
                const len = bytes[offset]
                offset += 1 + len
            }
            if (offset >= i + 188) continue
            const payload = bytes.subarray(offset, i + 188)

            if (pid === 0) {
                parsePat(payload, pmtPids)
                continue
            }
            if (pmtPids.has(pid)) {
                const pids = parsePmt(payload)
                if (pids.videoPid != null) videoPid = pids.videoPid
                if (pids.audioPid != null) audioPid = pids.audioPid
                continue
            }
            if (pid !== videoPid && pid !== audioPid) continue
            if (startIndicator) flushPes(pid)
            if (!pesBuf.has(pid)) pesBuf.set(pid, [])
            pesBuf.get(pid).push(payload.slice())
        }
        if (videoPid != null) flushPes(videoPid)
        if (audioPid != null) flushPes(audioPid)
    }

    const tracks = []
    if (videoSamples.length && videoNals.sps && videoNals.pps) {
        fillDurations(videoSamples, 3000)
        const dim = parseSpsDim(videoNals.sps)
        tracks.push({
            id: 1,
            handler: 'vide',
            timescale: 90000,
            width: dim.width,
            height: dim.height,
            volume: 0,
            stsd: makeAvc1Stsd(videoNals.sps, videoNals.pps, dim.width, dim.height),
            samples: videoSamples,
        })
    }
    if (audioSamples.length && audioMeta) {
        tracks.push({
            id: 2,
            handler: 'soun',
            timescale: audioMeta.sampleRate,
            width: 0,
            height: 0,
            volume: 0x0100,
            channels: audioMeta.channels,
            sampleRate: audioMeta.sampleRate,
            stsd: makeMp4aStsd(audioMeta),
            samples: audioSamples.map((s) => ({ ...s, duration: 1024 })),
        })
    }
    if (!tracks.some((t) => t.handler === 'vide')) throw new Error('MPEG-TS 找不到 H.264 影像')
    return tracks
}

function parsePat(payload, pmtPids) {
    let o = payload[0] + 1
    if (o + 8 > payload.byteLength) return
    const sectionLen = ((payload[o + 1] & 0x0f) << 8) | payload[o + 2]
    const end = Math.min(payload.byteLength, o + 3 + sectionLen - 4)
    o += 8
    while (o + 4 <= end) {
        const program = (payload[o] << 8) | payload[o + 1]
        const pid = ((payload[o + 2] & 0x1f) << 8) | payload[o + 3]
        if (program !== 0) pmtPids.add(pid)
        o += 4
    }
}

function parsePmt(payload) {
    let o = payload[0] + 1
    if (o + 12 > payload.byteLength) return {}
    const sectionLen = ((payload[o + 1] & 0x0f) << 8) | payload[o + 2]
    const progInfo = ((payload[o + 10] & 0x0f) << 8) | payload[o + 11]
    const end = Math.min(payload.byteLength, o + 3 + sectionLen - 4)
    o += 12 + progInfo
    let videoPid = null
    let audioPid = null
    while (o + 5 <= end) {
        const type = payload[o]
        const pid = ((payload[o + 1] & 0x1f) << 8) | payload[o + 2]
        const esLen = ((payload[o + 3] & 0x0f) << 8) | payload[o + 4]
        if (type === 0x1b || type === 0x20) videoPid = pid
        else if (type === 0x24) throw new Error('不支援 HEVC 離線轉檔')
        else if (type === 0x0f || type === 0x11 || type === 0x03 || type === 0x04) audioPid = audioPid ?? pid
        o += 5 + esLen
    }
    return { videoPid, audioPid }
}

function parsePes(bytes) {
    if (bytes.byteLength < 9 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1) return null
    const flags = bytes[7]
    const headerLen = bytes[8]
    let pts
    let dts
    let o = 9
    if ((flags & 0x80) && o + 5 <= 9 + headerLen) {
        pts = readTs33(bytes, o)
        o += 5
        if ((flags & 0x40) && o + 5 <= 9 + headerLen) dts = readTs33(bytes, o)
    }
    const payload = bytes.subarray(9 + headerLen)
    return { pts, dts, payload }
}

function readTs33(bytes, o) {
    return (
        (bytes[o] & 0x0e) * 0x20000000 +
        bytes[o + 1] * 0x400000 +
        (bytes[o + 2] & 0xfe) * 0x4000 +
        bytes[o + 3] * 0x80 +
        ((bytes[o + 4] & 0xfe) >> 1)
    )
}

function splitAnnexB(payload) {
    const nals = []
    let i = 0
    const findStart = (from) => {
        for (let x = from; x + 3 < payload.byteLength; x++) {
            if (payload[x] === 0 && payload[x + 1] === 0) {
                if (payload[x + 2] === 1) return { at: x, size: 3 }
                if (payload[x + 2] === 0 && payload[x + 3] === 1) return { at: x, size: 4 }
            }
        }
        return null
    }
    let start = findStart(0)
    while (start) {
        const next = findStart(start.at + start.size)
        const nalStart = start.at + start.size
        const nalEnd = next ? next.at : payload.byteLength
        if (nalEnd > nalStart) nals.push(payload.subarray(nalStart, nalEnd))
        start = next
        i++
        if (i > 10000) break
    }
    return nals
}

function unescapeRbsp(nal) {
    const out = []
    for (let i = 0; i < nal.byteLength; i++) {
        if (i + 2 < nal.byteLength && nal[i] === 0 && nal[i + 1] === 0 && nal[i + 2] === 3) {
            out.push(0, 0)
            i += 2
            continue
        }
        out.push(nal[i])
    }
    return new Uint8Array(out)
}

function avcSampleFromAnnexB(payload, store) {
    const nals = splitAnnexB(payload)
    if (!nals.length) return null
    const parts = []
    let sync = false
    let hasVcl = false
    for (const nal of nals) {
        if (!nal.byteLength) continue
        const type = nal[0] & 0x1f
        if (type === 9 || type === 12) continue
        if (type === 7) store.sps = unescapeRbsp(nal)
        if (type === 8) store.pps = unescapeRbsp(nal)
        if (type === 5) sync = true
        if (type === 1 || type === 5) hasVcl = true
        parts.push(u32(nal.byteLength), nal)
    }
    if (!hasVcl) return null
    return { data: concat(parts), sync }
}

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

function splitAdts(payload) {
    const frames = []
    let i = 0
    while (i + 7 <= payload.byteLength) {
        if (payload[i] !== 0xff || (payload[i + 1] & 0xf0) !== 0xf0) {
            i++
            continue
        }
        const srIndex = (payload[i + 2] >> 2) & 0x0f
        const channels = ((payload[i + 2] & 1) << 2) | ((payload[i + 3] >> 6) & 3)
        const frameLen = ((payload[i + 3] & 3) << 11) | (payload[i + 4] << 3) | ((payload[i + 5] >> 5) & 7)
        const hdr = 7 + ((payload[i + 1] & 1) ? 0 : 2)
        if (frameLen < hdr || i + frameLen > payload.byteLength) break
        frames.push({
            meta: { sampleRate: AAC_RATES[srIndex] || 44100, channels: channels || 2, srIndex, objectType: 2 },
            payload: payload.subarray(i + hdr, i + frameLen),
        })
        i += frameLen
    }
    return frames
}

function fillDurations(samples, fallback) {
    for (let i = 0; i < samples.length; i++) {
        const next = samples[i + 1]
        const dur = next ? Math.max(1, next.dts - samples[i].dts) : fallback
        samples[i].duration = dur > 0 ? dur : fallback
    }
}

class BitReader {
    constructor(bytes) {
        this.bytes = bytes
        this.bit = 0
    }
    u(n) {
        let v = 0
        for (let i = 0; i < n; i++) {
            const b = this.bytes[this.bit >> 3]
            const bit = 7 - (this.bit & 7)
            v = (v << 1) | ((b >> bit) & 1)
            this.bit++
        }
        return v
    }
    ue() {
        let z = 0
        while (this.u(1) === 0) z++
        return z ? (1 << z) - 1 + this.u(z) : 0
    }
    se() {
        const v = this.ue()
        return v & 1 ? (v + 1) >> 1 : -(v >> 1)
    }
    skipScaling() {
        const last = 8
        void last
        for (let i = 0; i < 8; i++) {
            if (this.u(1)) {
                const size = i < 6 ? 16 : 64
                let next = 8
                for (let j = 0; j < size; j++) {
                    const delta = this.se()
                    next = (next + delta + 256) % 256
                }
            }
        }
    }
}

function parseSpsDim(sps) {
    const r = new BitReader(sps)
    r.u(8)
    const profile = r.u(8)
    r.u(8)
    r.u(8)
    r.ue()
    const high = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]
    if (high.includes(profile)) {
        const chroma = r.ue()
        if (chroma === 3) r.u(1)
        r.ue()
        r.ue()
        r.u(1)
        if (r.u(1)) r.skipScaling()
    }
    r.ue()
    const pocType = r.ue()
    if (pocType === 0) r.ue()
    else if (pocType === 1) {
        r.u(1)
        r.se()
        r.se()
        const n = r.ue()
        for (let i = 0; i < n; i++) r.se()
    }
    r.ue()
    r.u(1)
    const wMbs = r.ue() + 1
    const hMap = r.ue() + 1
    const frameMbsOnly = r.u(1)
    if (!frameMbsOnly) r.u(1)
    r.u(1)
    let cropL = 0
    let cropR = 0
    let cropT = 0
    let cropB = 0
    if (r.u(1)) {
        cropL = r.ue()
        cropR = r.ue()
        cropT = r.ue()
        cropB = r.ue()
    }
    const width = wMbs * 16 - (cropL + cropR) * 2
    const height = (2 - frameMbsOnly) * hMap * 16 - (cropT + cropB) * 2
    return { width: Math.max(width, 16), height: Math.max(height, 16) }
}

function makeAvcC(sps, pps) {
    const body = [
        new Uint8Array([1, sps[1], sps[2], sps[3], 0xff, 0xe1]),
        u16(sps.byteLength),
        sps,
        new Uint8Array([1]),
        u16(pps.byteLength),
        pps,
    ]
    return box('avcC', concat(body))
}

function makeAvc1Stsd(sps, pps, width, height) {
    const visual = concat([
        new Uint8Array(6),
        u16(1),
        new Uint8Array(16),
        u16(width),
        u16(height),
        u32(0x00480000),
        u32(0x00480000),
        u32(0),
        u16(1),
        new Uint8Array(32),
        u16(0x0018),
        new Uint8Array([0xff, 0xff]),
        makeAvcC(sps, pps),
    ])
    const entry = box('avc1', visual)
    return fullBox('stsd', 0, 0, concat([u32(1), entry]))
}

function mpeg4Desc(tag, contents) {
    const body = contents instanceof Uint8Array ? contents : concat(contents)
    return concat([new Uint8Array([tag, body.byteLength]), body])
}

function makeMp4aStsd(meta) {
    const asc = new Uint8Array(2)
    const obj = meta.objectType || 2
    asc[0] = (obj << 3) | ((meta.srIndex >> 1) & 7)
    asc[1] = ((meta.srIndex & 1) << 7) | ((meta.channels || 2) << 3)
    const dsi = mpeg4Desc(0x05, asc)
    const decoderConfig = mpeg4Desc(
        0x04,
        concat([new Uint8Array([0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), dsi]),
    )
    const sl = mpeg4Desc(0x06, new Uint8Array([0x02]))
    const es = mpeg4Desc(0x03, concat([u16(1), new Uint8Array([0]), decoderConfig, sl]))
    const esds = fullBox('esds', 0, 0, es)
    const audio = concat([
        new Uint8Array(6),
        u16(1),
        new Uint8Array(8),
        u16(meta.channels || 2),
        u16(16),
        u32(0),
        u32((meta.sampleRate || 44100) << 16),
        esds,
    ])
    const entry = box('mp4a', audio)
    return fullBox('stsd', 0, 0, concat([u32(1), entry]))
}

function compactRle(values) {
    const entries = []
    for (const v of values) {
        const last = entries.at(-1)
        if (last && last.value === v) last.count++
        else entries.push({ count: 1, value: v })
    }
    return entries
}

function buildStbl(track) {
    const samples = track.samples
    const stsd = track.stsd
    const sttsEntries = compactRle(samples.map((s) => s.duration))
    const sttsBody = [u32(sttsEntries.length)]
    for (const e of sttsEntries) sttsBody.push(u32(e.count), u32(e.value))
    const stts = fullBox('stts', 0, 0, concat(sttsBody))

    const sync = []
    samples.forEach((s, i) => {
        if (s.sync) sync.push(i + 1)
    })
    const stss =
        track.handler === 'vide' && sync.length
            ? fullBox('stss', 0, 0, concat([u32(sync.length), ...sync.map(u32)]))
            : new Uint8Array(0)

    const needCtts = samples.some((s) => s.cts)
    const ctts = needCtts
        ? fullBox(
              'ctts',
              0,
              0,
              concat([
                  u32(samples.length),
                  ...samples.flatMap((s) => [u32(1), u32(s.cts >>> 0)]),
              ]),
          )
        : new Uint8Array(0)

    const stsc = fullBox('stsc', 0, 0, concat([u32(1), u32(1), u32(samples.length), u32(1)]))
    const stsz = fullBox('stsz', 0, 0, concat([u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.byteLength))]))
    const stco = fullBox('stco', 0, 0, concat([u32(1), u32(track._chunkOffset || 0)]))
    return box('stbl', concat([stsd, stts, stss, ctts, stsc, stsz, stco]))
}

function buildTrak(track, movieTimescale, durationMovie) {
    const mediaDuration = track.samples.reduce((s, x) => s + x.duration, 0)
    const tkhd = fullBox(
        'tkhd',
        0,
        3,
        concat([
            u32(0),
            u32(0),
            u32(track.id),
            u32(0),
            u32(durationMovie),
            u32(0),
            u32(0),
            u16(0),
            u16(0),
            u16(track.handler === 'soun' ? 0x0100 : 0),
            u16(0),
            identityMatrix(),
            u32((track.width || 0) << 16),
            u32((track.height || 0) << 16),
        ]),
    )
    const mdhd = fullBox(
        'mdhd',
        0,
        0,
        concat([u32(0), u32(0), u32(track.timescale), u32(mediaDuration), u16(0x55c4), u16(0)]),
    )
    const hdlr = fullBox(
        'hdlr',
        0,
        0,
        concat([
            u32(0),
            ascii(track.handler),
            u32(0),
            u32(0),
            u32(0),
            ascii(track.handler === 'soun' ? 'SoundHandler' : 'VideoHandler'),
            new Uint8Array([0]),
        ]),
    )
    const mediaHeader =
        track.handler === 'soun' ? fullBox('smhd', 0, 0, u32(0)) : fullBox('vmhd', 0, 1, concat([u16(0), u16(0), u16(0), u16(0)]))
    const dref = fullBox('dref', 0, 0, concat([u32(1), fullBox('url ', 0, 1, new Uint8Array(0))]))
    const dinf = box('dinf', dref)
    const minf = box('minf', concat([mediaHeader, dinf, buildStbl(track)]))
    const mdia = box('mdia', concat([mdhd, hdlr, minf]))
    void movieTimescale
    return box('trak', concat([tkhd, mdia]))
}

function identityMatrix() {
    const m = new Uint8Array(36)
    const v = new DataView(m.buffer)
    v.setUint32(0, 0x00010000)
    v.setUint32(16, 0x00010000)
    v.setUint32(32, 0x40000000)
    return m
}

function ascii(s) {
    const b = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
    return b
}

function buildMoov(tracks, movieTimescale, durationMovie) {
    const mvhd = fullBox(
        'mvhd',
        0,
        0,
        concat([
            u32(0),
            u32(0),
            u32(movieTimescale),
            u32(durationMovie),
            u32(0x00010000),
            u16(0x0100),
            u16(0),
            u32(0),
            u32(0),
            identityMatrix(),
            u32(0),
            u32(0),
            u32(0),
            u32(0),
            u32(0),
            u32(0),
            u32(Math.max(2, ...tracks.map((t) => t.id + 1))),
        ]),
    )
    return box('moov', concat([mvhd, ...tracks.map((t) => buildTrak(t, movieTimescale, durationMovie))]))
}

function buildProgressiveMp4(tracks) {
    const movieTimescale = 1000
    let durationMovie = 0
    for (const t of tracks) {
        const mediaDur = t.samples.reduce((s, x) => s + x.duration, 0)
        const movieDur = Math.round((mediaDur * movieTimescale) / t.timescale)
        if (movieDur > durationMovie) durationMovie = movieDur
        if (!t.stsd) throw new Error('缺少樣本描述')
    }
    const ftyp = box('ftyp', concat([ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41')]))
    const dummy = buildMoov(tracks, movieTimescale, durationMovie)
    let offset = ftyp.byteLength + dummy.byteLength + 8
    for (const t of tracks) {
        t._chunkOffset = offset
        offset += t.samples.reduce((s, x) => s + x.data.byteLength, 0)
    }
    const moov = buildMoov(tracks, movieTimescale, durationMovie)
    const mdatParts = tracks.flatMap((t) => t.samples.map((s) => s.data))
    const mdat = box('mdat', concat(mdatParts))
    return new Blob([ftyp, moov, mdat], { type: 'video/mp4' })
}
