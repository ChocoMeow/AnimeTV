import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createResolver, defineNuxtModule } from '@nuxt/kit'

/**
 * Scans server/lib/videoProviders/sources/*.js → `#video-providers`
 * (static imports; Nitro/Bun has no import.meta.glob).
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
                const files = readdirSync(sourcesDir).filter((f) => f.endsWith('.js')).sort()
                const imports = files
                    .map((f, i) => `import p${i} from ${JSON.stringify(join(sourcesDir, f).replace(/\\/g, '/'))}`)
                    .join('\n')
                return `${imports}\nexport default [${files.map((_, i) => `p${i}`).join(', ')}]\n`
            }
        })
    },
})
