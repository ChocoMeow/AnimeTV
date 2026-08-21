/**
 * Shared helpers for Supabase logical backup / restore.
 *
 * Official dump layout (roles + schema + data):
 * https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
 *
 * Env (.env, loaded automatically by Bun):
 *   SUPABASE_DB_URL or DATABASE_URL     — full Postgres URL (preferred)
 *   SUPABASE_DB_PASSWORD                — used with linked project if no URL
 *   SUPABASE_ACCESS_TOKEN               — optional CLI personal access token
 */
import { readFileSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Files written by backup / required by restore (order matters for restore). */
export const FILES = ['roles.sql', 'schema.sql', 'data.sql']

// ANSI colors only when attached to a TTY (keeps CI / redirected logs clean)
const c = (code, s, stream = process.stdout) => (stream.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)
export const log = {
    info: (s) => console.log(c('36', s)),
    ok: (s) => console.log(c('32', s)),
    warn: (s) => console.log(c('33', s)),
    err: (s) => console.error(c('31', s, process.stderr)),
    dim: (s) => console.log(c('2', s)),
    step: (s) => console.log(c('36', `→ ${s}`)),
}

export function die(err) {
    log.err(err?.message || err)
    process.exit(1)
}

/** Folder name: YYYY-MM-DD_HH-mm-ss */
export function stamp() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

/** Read DB credentials from env. Needs a URL or a password for the linked project. */
export function dbCreds() {
    const url = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim()
    const password = (process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || '').trim()
    const token = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()
    if (!url && !password) {
        throw new Error(
            'Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD in .env\n' +
                'Optional: SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens)',
        )
    }
    return { url, password, token }
}

/**
 * Connection string for psql / Docker restore.
 * If only a password is set, inject it into the linked pooler URL from supabase/.temp.
 */
export function dbUrl({ url, password }) {
    if (url) return url
    const pooler = readFileSync(join(ROOT, 'supabase/.temp/pooler-url'), 'utf8').trim()
    if (!pooler) throw new Error('Linked pooler URL missing — set SUPABASE_DB_URL or run: bunx supabase link')
    const u = new URL(pooler)
    u.password = password
    return u.toString()
}

/** Spawn a child process; inherit stdio so supabase/psql output stays visible. */
export function run(cmd, args, env = process.env) {
    return new Promise((ok, fail) => {
        const child = spawn(cmd, args, {
            cwd: ROOT,
            env,
            stdio: 'inherit',
            shell: process.platform === 'win32',
        })
        child.on('error', fail)
        child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`))))
    })
}

export function hasCmd(cmd) {
    return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { shell: true }).status === 0
}

export async function confirm(msg) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise((r) => rl.question(msg, r))
    rl.close()
    return /^y(es)?$/i.test(String(answer).trim())
}

/** Ensure the backup folder contains all three SQL files. */
export async function assertBackup(dir) {
    for (const name of FILES) {
        try {
            await access(join(dir, name))
        } catch {
            throw new Error(`Missing ${name} in ${dir}`)
        }
    }
}

/** Build `bunx supabase db dump …` args (URL mode or linked + password). */
export function dumpCmd({ url, password, file, extra = [] }) {
    const args = ['supabase', 'db', 'dump', '-f', file, ...extra]
    if (url) args.push('--db-url', url)
    else args.push('--linked', '-p', password)
    return args
}

/**
 * Official restore sequence: roles → schema → enable replica → data.
 * `session_replication_role = replica` disables triggers/FK checks while loading data.
 */
export function psqlArgs(db, files) {
    return [
        '--single-transaction',
        '--variable', 'ON_ERROR_STOP=1',
        '--file', files.roles,
        '--file', files.schema,
        '--command', 'SET session_replication_role = replica',
        '--file', files.data,
        '--dbname', db,
    ]
}

export { join, resolve }
