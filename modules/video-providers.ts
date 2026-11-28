import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createResolver, defineNuxtModule } from '@nuxt/kit'

/**
 * Scans server/lib/videoProviders/sources/<id>/index.js → `#video-providers`
 * (static imports; Nitro/Bun has no import.meta.glob).
 * Only directory plugins are loaded; helper modules next to index.js are ignored.
 */
export default defineNuxtModule({
    meta: { name: 'video-providers', configKey: 'videoProviders' },
    setup(_options, nuxt) {
        const { resolve } = createResolver(import.meta.url)
        const sourcesDir = resolve('../server/lib/videoProviders/sources')

        nuxt.hook('nitro:config', (nitroConfig) => {
            nitroConfig.virtual ||= {}
            nitroConfig.virtual['#video-providers'] = () => {
                if (!existsSync(sourcesDir)) return 'export default []\n'

                const dirs = readdirSync(sourcesDir)
                    .filter((name) => {
                        const dir = join(sourcesDir, name)
                        return (
                            statSync(dir).isDirectory()
                            && existsSync(join(dir, 'index.js'))
                        )
                    })
                    .sort()

                const imports = dirs
                    .map((name, i) => {
                        const entry = join(sourcesDir, name, 'index.js').replace(/\\/g, '/')
                        return `import p${i} from ${JSON.stringify(entry)}`
                    })
                    .join('\n')

                return `${imports}\nexport default [${dirs.map((_, i) => `p${i}`).join(', ')}]\n`
            }
        })
    },
})
