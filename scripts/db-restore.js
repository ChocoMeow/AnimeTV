#!/usr/bin/env bun
/**
 * Restore a backup folder created by db-backup.js.
 *
 * Applies roles.sql → schema.sql → data.sql in one transaction (Supabase guide).
 * Prefers local `psql`; falls back to `docker run postgres:17` if psql is missing.
 *
 * Usage:
 *   bun run db:restore -- backups/2026-08-06_10-13-56
 *   bun scripts/db-restore.js backups/2026-08-06_10-13-56 --yes
 */
import {
    assertBackup,
    confirm,
    dbCreds,
    dbUrl,
    die,
    hasCmd,
    join,
    log,
    psqlArgs,
    resolve,
    run,
} from './db-common.js'

const argv = process.argv.slice(2)
const yes = argv.includes('-y') || argv.includes('--yes')
const dir = argv.find((a) => !a.startsWith('-'))

if (!dir || argv.includes('-h') || argv.includes('--help')) {
    console.log('Usage: bun scripts/db-restore.js <backup-dir> [--yes]')
    process.exit(dir ? 0 : 1)
}

main().catch(die)

async function main() {
    const backupDir = resolve(dir)
    await assertBackup(backupDir)

    const url = dbUrl(dbCreds())

    log.info(`Restore ← ${backupDir}`)
    log.warn('  Applies roles.sql + schema.sql + data.sql (can overwrite DB state)')

    if (!yes && !(await confirm('Continue? [y/N] '))) {
        log.dim('Aborted')
        return
    }

    const hostFiles = {
        roles: join(backupDir, 'roles.sql'),
        schema: join(backupDir, 'schema.sql'),
        data: join(backupDir, 'data.sql'),
    }

    if (hasCmd('psql')) {
        log.step('psql')
        await run('psql', psqlArgs(url, hostFiles))
    } else if (hasCmd('docker')) {
        // Mount backup dir read-only; paths inside the container are under /backup
        log.step('docker postgres:17')
        await run('docker', [
            'run', '--rm',
            '-v', `${backupDir}:/backup:ro`,
            'postgres:17',
            'psql',
            ...psqlArgs(url, {
                roles: '/backup/roles.sql',
                schema: '/backup/schema.sql',
                data: '/backup/data.sql',
            }),
        ])
    } else {
        throw new Error('Need psql on PATH or Docker Desktop')
    }

    log.ok('Restore complete')
}
