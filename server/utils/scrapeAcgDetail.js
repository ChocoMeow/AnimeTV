import * as cheerio from 'cheerio'
import { matchAnimeTags } from '~~/shared/animeTags'

export function sanitizeWikiContentHtml(rawHtml = '') {
    if (!rawHtml) return ''

    const $ = cheerio.load(rawHtml, null, false)

    $('script, style, object, embed, form, input, button, textarea, select, link, meta, noscript, svg, math').remove()
    $("a[href*='recentEdit.php']").closest('table').remove()
    $('td').filter((_, el) => $(el).text().includes('近期編輯')).closest('table').remove()

    $('a').each((_, el) => {
        const $el = $(el)
        const href = ($el.attr('href') || '').trim()
        const normalized = href.replace(/\s+/g, '').toLowerCase()
        const safe =
            normalized.startsWith('http://') ||
            normalized.startsWith('https://') ||
            normalized.startsWith('//') ||
            normalized.startsWith('/') ||
            normalized.startsWith('#') ||
            normalized.startsWith('mailto:') ||
            normalized.startsWith('tel:')

        if (!safe) $el.removeAttr('href')
        else {
            $el.attr('rel', 'noopener noreferrer nofollow')
            if (/^https?:\/\//i.test(href)) $el.attr('target', '_blank')
            else $el.removeAttr('target')
        }
        $el.removeAttr('style')
    })

    return $.root().html() || ''
}

function parseLabeledList($, selector) {
    const map = {}
    $(selector).find('li').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim()
        const idx = text.indexOf('：')
        if (idx === -1) return
        const value = text.slice(idx + 1).trim()
        if (value) map[text.slice(0, idx).trim()] = value
    })
    return map
}

function extractDescription($) {
    const parts = []
    $('.wikiContent').first().children().each((_, el) => {
        const tag = el.tagName?.toLowerCase()
        if (!tag || tag === 'table' || tag === 'script' || tag === 'br' || tag === 'style') return

        const text = $(el).text().replace(/\s+/g, ' ').trim()
        if (!text) return
        if (/^[＜<].+[＞>]/.test(text) || /^(STAFF|CAST)\b/.test(text)) return false

        parts.push(text)
    })
    return parts.join('\n').trim() || null
}

/** Drop scripts/styles before Cheerio — big win on low-power CPUs. */
function lightenHtml(html, { keepWiki }) {
    let out = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

    // Autofill only needs a short wiki intro for description — drop the rest
    if (!keepWiki) {
        out = out.replace(
            /(<div class="wikiContent"[^>]*>)([\s\S]*?)(<\/div>\s*<script|<\/div>\s*<h4)/i,
            (_, open, body, close) => {
                const cut = body.search(/＜製作團隊＞|＜聲優|STAFF|CAST/)
                const slim = cut === -1 ? body.slice(0, 4000) : body.slice(0, cut)
                return open + slim + (close.startsWith('</div>') ? close : '</div>')
            },
        )
        // Drop news / related / review chrome after wiki
        const news = out.search(/作品相關新聞|最新相關創作|同好也關注/)
        if (news > 0) out = out.slice(0, news)
    }

    return out
}

/**
 * @param {string} detailId
 * @param {{ includeWiki?: boolean }} [opts]
 */
export async function scrapeAcgDetail(detailId, opts = {}) {
    const includeWiki = opts.includeWiki === true

    try {
        if (!isValidNumberString(detailId)) {
            throw new Error(`Invalid details ID: "${detailId}"`)
        }

        const { html } = await cfFetch(`${ACG_GAMER_BASE_URL}acgDetail.php?s=${detailId}`) || {}
        if (!html) return null

        const $ = cheerio.load(lightenHtml(html, { keepWiki: includeWiki }))

        const title = $('.ACG-info-container h1').first().text().trim()
        if (!title && !$('.wikiContent').length) return null

        const listA = parseLabeledList($, '.ACG-box1listA')
        const listB = parseLabeledList($, '.ACG-box1listB')

        const typeTags = [...new Set(
            $('.ACG-box1listA li')
                .filter((_, el) => $(el).text().includes('作品類型'))
                .find('a')
                .map((_, a) => $(a).text().trim())
                .get()
                .filter(Boolean)
                .flatMap((tag) => matchAnimeTags(tag)),
        )]

        const scoreText = $('.ACG-box .score-overall-number').first().text().trim()
        const votesText = $('.ACG-box .score-overall-people').first().text().trim()
        const viewsText = $(`#w2pnum_${detailId}`).text().trim() || $('.BH-acgbox > span').last().text().trim()
        const premiere_date = listA['當地首播'] || listA['台灣首播'] || null

        return {
            source_details_id: detailId,
            title: title || null,
            description: extractDescription($),
            thumbnail: $('#ACG-box1pic img').first().attr('src')?.trim() || null,
            premiere_date,
            director: listB['導演監督'] || null,
            distributor: listB['台灣代理'] || null,
            production_company: listB['製作廠商'] || null,
            tags: typeTags,
            views: viewsText ? Number(viewsText.replace(/[^\d]/g, '')) || null : null,
            score: scoreText ? Number(scoreText) : null,
            votes: votesText ? Number(votesText.replace(/[^\d]/g, '')) || 0 : null,
            wikiContentHtml: includeWiki
                ? sanitizeWikiContentHtml($('.wikiContent').first().html() || '')
                : '',
        }
    } catch (err) {
        console.error('Error scraping acgDetail:', err.message)
        return null
    }
}
