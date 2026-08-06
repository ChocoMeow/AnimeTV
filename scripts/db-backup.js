#!/usr/bin/env bun
/**
 * Full Supabase DB backup.
 *
 * Writes three SQL files into one dated folder (Docker required — CLI runs pg_dump in a container):
 *   backups/YYYY-MM-DD_HH-mm-ss/
 *     roles.sql   — cluster roles
 *     schema.sql  — schema / DDL
 *     data.sql    — table data (COPY)
 *
 * Usage:
 *   bun run db:backup
 *   bun scripts/db-backup.js --out backups/custom-name
 */
import { mkdir } from 'node:fs/promises'
import {
    FILES,
    ROOT,
    dbCreds,
    die,
    dumpCmd,
    join,
    log,
    resolve,
    run,
    stamp,
} from './db-common.js'

// Match Supabase backup-restore guide; exclude vector storage internals from data dump
const DUMPS = [
    ['roles.sql', ['--role-only']],
    ['schema.sql', []],
    ['data.sql', ['--data-only', '--use-copy', '-x', 'storage.buckets_vectors', '-x', 'storage.vector_indexes']],
]

const argv = process.argv.slice(2)
if (argv.includes('-h') || argv.includes('--help')) {
    console.log('Usage: bun scripts/db-backup.js [--out dir]\nNeeds Docker + SUPABASE_DB_URL or SUPABASE_DB_PASSWORD in .env')
    process.exit(0)
}

const i = argv.findIndex((a) => a === '-o' || a === '--out')
const outDir = resolve(i >= 0 ? argv[i + 1] : join(ROOT, 'backups', stamp()))

main().catch(die)

async function main() {
    const { url, password, token } = dbCreds()
    // Forward personal access token to the CLI when present
    const env = token ? { ...process.env, SUPABASE_ACCESS_TOKEN: token } : process.env

    await mkdir(outDir, { recursive: true })
    log.info(`Backup → ${outDir}`)
    log.dim(`  mode: ${url ? 'db-url' : 'linked'}`)

    for (const [name, extra] of DUMPS) {
        log.step(name)
        await run('bunx', dumpCmd({ url, password, file: join(outDir, name), extra }), env)
    }

    log.ok('Backup complete')
    for (const f of FILES) log.dim(`  ${join(outDir, f)}`)
}
