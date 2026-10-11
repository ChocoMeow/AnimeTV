#!/usr/bin/env bun
/**
 * Version helpers for CI / Docker (major.minor.patch).
 *
 *   node scripts/build-version.mjs bump beta|main
 *     beta: 1.0.1 → 1.0.2b1 → 1.0.2b2
 *     main: 1.0.2b2 → 1.0.2  |  1.0.2 → 1.0.3
 *
 *   node scripts/build-version.mjs write
 *     Writes shared/buildInfo.js from APP_VERSION, APP_CHANNEL, GIT_SHA
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'package.json')
const buildInfoPath = join(root, 'shared', 'buildInfo.js')

const [cmd = 'write', branch = 'main'] = process.argv.slice(2)

function readPkg() {
    return JSON.parse(readFileSync(pkgPath, 'utf8'))
}

/** Normalize legacy x.x / x.xbN → x.x.0 / x.x.0bN */
function normalize(version) {
    const twoBeta = /^(\d+)\.(\d+)b(\d+)$/.exec(version)
    if (twoBeta) return `${twoBeta[1]}.${twoBeta[2]}.0b${twoBeta[3]}`
    const two = /^(\d+)\.(\d+)$/.exec(version)
    if (two) return `${two[1]}.${two[2]}.0`
    return version
}

function bumpVersion(branchName) {
    const pkg = readPkg()
    const current = normalize(pkg.version || '1.0.0')
    const beta = /^(\d+)\.(\d+)\.(\d+)b(\d+)$/.exec(current)
    const stable = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)

    if (branchName === 'beta') {
        if (beta) {
            pkg.version = `${beta[1]}.${beta[2]}.${beta[3]}b${Number(beta[4]) + 1}`
        } else if (stable) {
            pkg.version = `${stable[1]}.${stable[2]}.${Number(stable[3]) + 1}b1`
        } else {
            pkg.version = '1.0.0b1'
        }
    } else if (beta) {
        pkg.version = `${beta[1]}.${beta[2]}.${beta[3]}`
    } else if (stable) {
        pkg.version = `${stable[1]}.${stable[2]}.${Number(stable[3]) + 1}`
    } else {
        pkg.version = '1.0.0'
    }

    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`)
    console.log(pkg.version)
}

function writeBuildInfo() {
    let version = process.env.APP_VERSION
    if (!version) {
        try {
            version = readPkg().version || '1.0.0'
        } catch {
            version = '1.0.0'
        }
    }
    const channel = process.env.APP_CHANNEL || 'development'
    const gitSha = process.env.GIT_SHA || 'local'

    writeFileSync(
        buildInfoPath,
        `/** Overwritten by scripts/build-version.mjs write */
export const buildInfo = {
    version: ${JSON.stringify(version)},
    channel: ${JSON.stringify(channel)},
    gitSha: ${JSON.stringify(gitSha)},
}
`,
    )
    console.log(`buildInfo → v${version} · ${channel} · ${gitSha}`)
}

if (cmd === 'bump') bumpVersion(branch)
else if (cmd === 'write') writeBuildInfo()
else {
    console.error(`Usage: build-version.mjs bump <beta|main> | write`)
    process.exit(1)
}
