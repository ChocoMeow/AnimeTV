#!/usr/bin/env bun
/**
 * Updates shared/buildInfo.js for the Nuxt build.
 *
 * Env: APP_VERSION, APP_CHANNEL (stable|beta|development), GIT_SHA
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'shared', 'buildInfo.js')

function pkgVersion() {
    try {
        return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || '0.0.0'
    } catch {
        return '0.0.0'
    }
}

const version = process.env.APP_VERSION || pkgVersion()
const channel = process.env.APP_CHANNEL || 'development'
const gitSha = process.env.GIT_SHA || 'local'

const file = `/** Overwritten by scripts/write-build-info.mjs before CI/Docker builds. */
export const buildInfo = {
    version: ${JSON.stringify(version)},
    channel: ${JSON.stringify(channel)},
    gitSha: ${JSON.stringify(gitSha)},
}
`

writeFileSync(outPath, file, 'utf8')
console.log(`buildInfo → v${version} · ${channel} · ${gitSha}`)
