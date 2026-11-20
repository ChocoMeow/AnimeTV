/** Bidirectional sync for anime_meta.related_anime_source_ids. */

/** Remove self from related_anime_source_ids before insert/update (mutates payload). */
export function stripSelfRelated(payload, selfId = payload?.source_id) {
    const self = String(selfId ?? '').trim()
    if (!self || !payload || !Array.isArray(payload.related_anime_source_ids)) return payload
    const next = payload.related_anime_source_ids.filter((x) => String(x).trim() !== self)
    payload.related_anime_source_ids = next.length ? next : null
    return payload
}

function idSet(ids, exclude) {
    const out = new Set()
    if (!Array.isArray(ids)) return out
    for (const id of ids) {
        const n = String(id ?? '').trim()
        if (n && n !== exclude) out.add(n)
    }
    return out
}

function toStoredId(id, sample) {
    if (typeof sample === 'number') {
        const n = Number(id)
        return Number.isFinite(n) ? n : id
    }
    return String(id)
}

/** One SELECT for all targets, then parallel UPDATEs only where the list changed. */
async function patchTargets(client, selfId, addIds, removeIds) {
    const targets = [...new Set([...addIds, ...removeIds])]
    if (!targets.length) return

    const { data: rows, error } = await client
        .from('anime_meta')
        .select('source_id, related_anime_source_ids')
        .in('source_id', targets)
    if (error) throw error
    if (!rows?.length) return

    const add = new Set(addIds)
    const remove = new Set(removeIds)
    const writes = []

    for (const row of rows) {
        const key = String(row.source_id)
        const before = Array.isArray(row.related_anime_source_ids) ? row.related_anime_source_ids : []
        let next = before

        if (remove.has(key)) {
            const filtered = before.filter((x) => String(x) !== selfId)
            if (filtered.length !== before.length) next = filtered
        }
        if (add.has(key) && !next.some((x) => String(x) === selfId)) {
            next = [...next, toStoredId(selfId, next[0] ?? row.source_id)]
        }
        if (next === before) continue

        writes.push(
            client
                .from('anime_meta')
                .update({ related_anime_source_ids: next.length ? next : null })
                .eq('source_id', row.source_id),
        )
    }

    if (!writes.length) return
    for (const { error: err } of await Promise.all(writes)) {
        if (err) throw err
    }
}

/**
 * Sync reverse links after save, or clear them on delete (`nextIds = []`).
 * @param {unknown} nextIds related ids on this row after save
 * @param {unknown} [prevIds] related ids before save (omit / [] on create)
 */
export async function syncRelatedLinks(client, selfId, nextIds, prevIds = []) {
    const self = String(selfId ?? '').trim()
    if (!self) return

    const next = idSet(nextIds, self)
    const prev = idSet(prevIds, self)

    await patchTargets(
        client,
        self,
        [...next].filter((id) => !prev.has(id)),
        [...prev].filter((id) => !next.has(id)),
    )
}
