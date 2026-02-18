function toArabicNumber(chineseNum) {
    const map = {
        "零": 0, "一": 1, "二": 2, "三": 3, "四": 4,
        "五": 5, "六": 6, "七": 7, "八": 8, "九": 9
    };
    return map[chineseNum] || null;
}

// Convert Roman numerals to numbers
function romanToNumber(roman) {
    const romanMap = {
        'I': 1, 'Ⅰ': 1, 'II': 2, 'Ⅱ': 2, 'III': 3, 'Ⅲ': 3,
        'IV': 4, 'Ⅳ': 4, 'V': 5, 'Ⅴ': 5, 'VI': 6, 'Ⅵ': 6,
        'VII': 7, 'Ⅶ': 7, 'VIII': 8, 'Ⅷ': 8, 'IX': 9, 'Ⅸ': 9, 'X': 10, 'Ⅹ': 10
    };
    return romanMap[roman.toUpperCase()] || null;
}

function extractSeasonInfo(title) {
    const seasonPatterns = [
        // Final season patterns (mark as special season 'final')
        { regex: /(final\s*season|最終季|完結篇|最終章|final|最終回)/gi, type: 'final' },
        // Chinese patterns - 季 (season) and 期 (period/season)
        { regex: /第([一二三四五六七八九十]+)季/g, type: 'chinese' },
        { regex: /第([一二三四五六七八九十]+)期/g, type: 'chinese' },
        { regex: /第(\d+)季/g, type: 'chineseNumber' },
        { regex: /第(\d+)期/g, type: 'chineseNumber' },
        // English patterns
        { regex: /season\s*(\d+)/gi, type: 'number' },
        { regex: /\bs(\d+)\b/gi, type: 'number' },
        // Roman numerals at end with context
        { regex: /\s+([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*(?:\(|（|$)/g, type: 'roman' },
        { regex: /\s+([IVX]{1,4})\s*(?:\(|（|$)/g, type: 'roman' },
    ];

    // Part patterns - must be detected separately
    const partPatterns = [
        { regex: /前篇|上篇|part\s*1|part\s*i\b|パート1/gi, type: 'part1' },
        { regex: /後篇|下篇|part\s*2|part\s*ii\b|パート2/gi, type: 'part2' },
        { regex: /part\s*(\d+)/gi, type: 'partNumber' },
        { regex: /cour\s*(\d+)/gi, type: 'courNumber' },
    ];

    // Spin-off patterns - extract the spin-off title
    const spinoffPatterns = [
        { regex: /外傳[：:\s]*(.+?)(?:\s|$)/gi, type: 'spinoff' },
        { regex: /外传[：:\s]*(.+?)(?:\s|$)/gi, type: 'spinoff' },
        { regex: /番外編[：:\s]*(.+?)(?:\s|$)/gi, type: 'spinoff' },
    ];

    let seasons = [];
    let isFinalSeason = false;
    let parts = [];
    let hasPart = false;
    let cleanTitle = title;
    let spinoffTitle = null;
    let hasSpinoff = false;

    for (const pattern of seasonPatterns) {
        let match;
        while ((match = pattern.regex.exec(title)) !== null) {
            let seasonNum = null;

            if (pattern.type === 'final') {
                isFinalSeason = true;
                seasons.push('final');
                cleanTitle = cleanTitle.replace(match[0], ' ');
            } else if (pattern.type === 'chinese') {
                const chars = match[1].split('');
                if (chars.length === 1) {
                    seasonNum = toArabicNumber(chars[0]);
                } else if (chars[0] === '十') {
                    seasonNum = 10 + (toArabicNumber(chars[1]) || 0);
                } else if (chars[1] === '十') {
                    seasonNum = toArabicNumber(chars[0]) * 10;
                }
                if (seasonNum !== null && seasonNum >= 1 && seasonNum <= 10) {
                    seasons.push(seasonNum);
                    cleanTitle = cleanTitle.replace(match[0], ' ');
                }
            } else if (pattern.type === 'chineseNumber') {
                // Handle patterns like "第2季" or "第3期"
                seasonNum = parseInt(match[1]);
                if (seasonNum >= 1 && seasonNum <= 10) {
                    seasons.push(seasonNum);
                    cleanTitle = cleanTitle.replace(match[0], ' ');
                }
            } else if (pattern.type === 'number') {
                seasonNum = parseInt(match[1]);
                if (seasonNum >= 1 && seasonNum <= 10) {
                    seasons.push(seasonNum);
                    cleanTitle = cleanTitle.replace(match[0], ' ');
                }
            } else if (pattern.type === 'roman') {
                // Only treat as season if it's reasonable (1-10)
                const num = romanToNumber(match[1]);
                if (num && num <= 10) {
                    seasons.push(num);
                    cleanTitle = cleanTitle.replace(match[0], ' ');
                }
            }
        }
        pattern.regex.lastIndex = 0;
    }

    // Detect part indicators
    for (const pattern of partPatterns) {
        let match;
        while ((match = pattern.regex.exec(title)) !== null) {
            hasPart = true;
            
            if (pattern.type === 'part1') {
                parts.push(1);
                cleanTitle = cleanTitle.replace(match[0], ' ');
            } else if (pattern.type === 'part2') {
                parts.push(2);
                cleanTitle = cleanTitle.replace(match[0], ' ');
            } else if (pattern.type === 'partNumber' || pattern.type === 'courNumber') {
                const partNum = parseInt(match[1]);
                if (partNum >= 1 && partNum <= 10) {
                    parts.push(partNum);
                    cleanTitle = cleanTitle.replace(match[0], ' ');
                }
            }
        }
        pattern.regex.lastIndex = 0;
    }

    // Detect spin-off titles
    for (const pattern of spinoffPatterns) {
        let match;
        while ((match = pattern.regex.exec(title)) !== null) {
            hasSpinoff = true;
            // Extract the spin-off title (everything after the spin-off indicator)
            const extracted = match[1]?.trim();
            if (extracted && extracted.length > 0) {
                spinoffTitle = extracted;
                // For clean title, use the spin-off title as the main title
                cleanTitle = extracted;
            }
            break; // Only take the first spin-off match
        }
        pattern.regex.lastIndex = 0;
        if (hasSpinoff) break;
    }

    return {
        baseTitle: cleanTitle,
        seasons: [...new Set(seasons)],
        hasSeason: seasons.length > 0,
        isFinalSeason,
        parts: [...new Set(parts)],
        hasPart,
        spinoffTitle,
        hasSpinoff
    };
}

function normalizeTitle(str) {
    return str
        .replace(/\s*\[[^\]]*\]/g, "") // Remove bracketed text
        .replace(/\s*\([^)]*\)/g, "") // Remove parentheses content
        .replace(/（[^）]*）/g, "") // Remove full-width parentheses content
        .replace(/「|」|『|』/g, "") // Remove quotes
        .replace(/！|。|、|，/g, "") // Remove punctuation
        .replace(/[:：]/g, " ") // Replace colons with space
        .replace(/[.,:;=\-\/?'"!@#$%^&*_+[\]{}<>|`~‧·′'－．・～＆]/g, " ") // Replace special chars with space
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim()
        .toLowerCase();
}

function parseTitle(title) {
    const { baseTitle, seasons, hasSeason, isFinalSeason, parts, hasPart, spinoffTitle, hasSpinoff } = extractSeasonInfo(title);
    const normalized = normalizeTitle(baseTitle);

    const chinesePart = normalized.replace(/[a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
    const englishPart = normalized.replace(/[^\x00-\x7F]+/g, ' ').replace(/\s+/g, ' ').trim();

    return {
        original: title,
        normalized,
        chinesePart,
        englishPart,
        seasons,
        hasSeason,
        isFinalSeason,
        parts,
        hasPart,
        spinoffTitle,
        hasSpinoff,
        tokens: normalized.split(/\s+/).filter(t => t.length > 0)
    };
}

function levenshteinDistance(a, b) {
    if (a.length < b.length) [a, b] = [b, a];
    const m = b.length;
    let prev = Array.from({ length: m + 1 }, (_, i) => i);
    let curr = new Array(m + 1);
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= m; j++) {
            curr[j] = a[i - 1] === b[j - 1]
                ? prev[j - 1]
                : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[m];
}

function levenshteinSimilarity(str1, str2) {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;
    const distance = levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
}

function jaroWinklerSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;

    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0 || len2 === 0) return 0.0;

    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < len1; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, len2);

        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1[i] !== s2[j]) continue;
            s1Matches[i] = s2Matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0.0;

    let k = 0;
    for (let i = 0; i < len1; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
    }

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
        if (s1[i] === s2[i]) prefix++;
        else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
}

function tokenSetRatio(str1, str2) {
    const tokens1 = new Set(str1.split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(str2.split(/\s+/).filter(t => t.length > 0));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
}

function ngramSimilarity(str1, str2, n = 2) {
    function getNgrams(str, n) {
        const ngrams = new Set();
        for (let i = 0; i <= str.length - n; i++) {
            ngrams.add(str.substring(i, i + n));
        }
        return ngrams;
    }

    const ngrams1 = getNgrams(str1, n);
    const ngrams2 = getNgrams(str2, n);

    const intersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
    const union = new Set([...ngrams1, ...ngrams2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
}

function weightedSim(s1, s2) {
    return levenshteinSimilarity(s1, s2) * 0.4 + jaroWinklerSimilarity(s1, s2) * 0.4 + tokenSetRatio(s1, s2) * 0.2;
}

function scorePairMatch(has1, has2, list1, list2) {
    if (has1 && has2) {
        return list1.some(v => list2.includes(v)) ? [1.0, 1.0] : [0.1, 0.2];
    }
    return has1 === has2 ? [1.0, 1.0] : [0.3, 0.4];
}

function calculateMatchScore(parsed1, parsed2) {
    const norm1 = parsed1.normalized;
    const norm2 = parsed2.normalized;
    let titleScore = 0;

    if (parsed1.hasSpinoff || parsed2.hasSpinoff) {
        const a = parsed1.hasSpinoff ? normalizeTitle(parsed1.spinoffTitle || '') : norm1;
        const b = parsed2.hasSpinoff ? normalizeTitle(parsed2.spinoffTitle || '') : norm2;
        titleScore = weightedSim(a, b);
    }

    if (titleScore < 0.6) {
        if (parsed1.chinesePart && parsed2.chinesePart) {
            const cs = levenshteinSimilarity(parsed1.chinesePart, parsed2.chinesePart) * 0.5
                     + jaroWinklerSimilarity(parsed1.chinesePart, parsed2.chinesePart) * 0.5;
            if (cs > 0.8) titleScore = cs;
        }

        if (titleScore < 0.8) {
            titleScore = Math.max(titleScore,
                levenshteinSimilarity(norm1, norm2) * 0.25 +
                jaroWinklerSimilarity(norm1, norm2) * 0.30 +
                tokenSetRatio(norm1, norm2) * 0.25 +
                ngramSimilarity(norm1, norm2, 2) * 0.10 +
                ngramSimilarity(norm1, norm2, 3) * 0.10
            );
        }

        const [shorter, longer] = norm1.length < norm2.length ? [norm1, norm2] : [norm2, norm1];
        if (longer.includes(shorter) && shorter.length > 3) {
            titleScore += (shorter.length / longer.length) * 0.15;
        }
    }

    let [seasonScore, seasonPenalty] = scorePairMatch(parsed1.hasSeason, parsed2.hasSeason, parsed1.seasons, parsed2.seasons);
    if (parsed1.hasSeason && parsed2.hasSeason && seasonScore < 1.0) {
        const bothFinal = parsed1.isFinalSeason && parsed2.isFinalSeason;
        const oneFinal = parsed1.isFinalSeason !== parsed2.isFinalSeason;
        if (bothFinal) { seasonScore = 1.0; seasonPenalty = 1.0; }
        else if (oneFinal) { seasonScore = 0.1; seasonPenalty = 0.2; }
        else { seasonScore = 0.2; seasonPenalty = 0.3; }
    }

    const [partScore, partPenalty] = scorePairMatch(parsed1.hasPart, parsed2.hasPart, parsed1.parts, parsed2.parts);
    const finalScore = Math.min(
        titleScore * seasonPenalty * partPenalty * 0.80 + (seasonScore * 0.6 + partScore * 0.4) * 0.20,
        1.0
    );

    return { score: finalScore, titleScore, seasonScore, seasonPenalty, partScore, partPenalty };
}

// Pre-parsed candidates cache (avoids re-parsing ~3000 titles per batch)
let _parsedCandidates = null;
let _parsedCandidatesTs = 0;

async function getParsedCandidates() {
    const candidates = await fetchAnimeData();
    if (_parsedCandidates && _parsedCandidatesTs === ANIME1_LIST_CACHE.timestamp) {
        return _parsedCandidates;
    }
    _parsedCandidates = candidates.map(c => ({ ...c, _parsed: parseTitle(c.title) }));
    _parsedCandidatesTs = ANIME1_LIST_CACHE.timestamp;
    return _parsedCandidates;
}

function sortMatches(matches) {
    matches.sort((a, b) => {
        if (Math.abs(a.score - b.score) > 0.05) return b.score - a.score;
        return a.seasonPenalty !== b.seasonPenalty ? b.seasonPenalty - a.seasonPenalty : b.score - a.score;
    });
    return matches;
}

function findMatchesForParsedQuery(parsedQuery, parsedCandidates, threshold = 0.6, topN = 5) {
    const matches = [];
    for (const candidate of parsedCandidates) {
        const { score, titleScore, seasonScore, seasonPenalty, partScore, partPenalty } =
            calculateMatchScore(parsedQuery, candidate._parsed);
        if (score >= threshold) {
            const { _parsed, ...rest } = candidate;
            matches.push({ ...rest, score, titleScore, seasonScore, seasonPenalty, partScore, partPenalty });
        }
    }
    return sortMatches(matches).slice(0, topN);
}

export async function searchAnimeTitle(query, threshold = 0.70) {
    try {
        const candidates = await getParsedCandidates();
        return findMatchesForParsedQuery(parseTitle(query), candidates, threshold);
    } catch (error) {
        console.error("Error searching anime title:", error);
        return [];
    }
}

export async function matchAnimeWithDb(client, animeList) {
    if (!animeList?.length) return [];

    const uniqueIds = [...new Set(animeList.map(a => a.refId ?? a.source_id).filter(Boolean))];
    const knownIds = new Set();

    if (uniqueIds.length) {
        const { data, error } = await client
            .from("anime_meta")
            .select("source_id")
            .in("source_id", uniqueIds);
        if (error) console.error("matchAnimeWithDb:", error);
        else data?.forEach(r => knownIds.add(r.source_id));
    }

    const results = animeList.map(item => {
        const id = item.refId ?? item.source_id;
        return { ...item, inDb: !!(id && knownIds.has(String(id))) };
    });
    const unmatched = results.filter(r => !r.inDb && (r.title || r.refId));

    if (!unmatched.length) return results;

    const matched = await matchAnime(unmatched);
    const matchByKey = new Map(matched.map(r => [r.refId ?? r.title, r]));

    for (const item of results) {
        if (item.inDb) continue;
        const match = matchByKey.get(item.refId ?? item.title);
        if (match?.matchedVideo) item.matchedVideo = match.matchedVideo;
    }

    return results;
}

export async function matchAnime(animeList, matchThreshold = 0.70) {
    if (!animeList?.length) return [];

    const candidates = await getParsedCandidates();
    if (!candidates?.length) return [];

    return animeList.map(anime => {
        if (!anime.title || !anime.refId) return null;

        const matches = findMatchesForParsedQuery(parseTitle(anime.title), candidates, matchThreshold);
        if (!matches.length) return null;

        const premiereYear = anime.year?.split("/")?.[0]?.trim();
        const bestMatch = (premiereYear && matches.find(m => String(m.year) === premiereYear && m.score >= 0.70)) || matches[0];

        return {
            ...anime,
            matchedVideo: {
                id: bestMatch.id,
                year: bestMatch.year,
                season: bestMatch.season,
                matchScore: bestMatch.score,
                titleScore: bestMatch.titleScore,
                seasonScore: bestMatch.seasonScore,
                seasonPenalty: bestMatch.seasonPenalty,
                partScore: bestMatch.partScore,
                partPenalty: bestMatch.partPenalty,
            },
            allMatches: matches.slice(0, 3),
        };
    }).filter(Boolean);
}

export async function fetchAnimeData() {
    const currentTime = Date.now()

    if (ANIME1_LIST_CACHE.data && (currentTime - ANIME1_LIST_CACHE.timestamp < CACHE_LIFETIME)) {
        return ANIME1_LIST_CACHE.data
    }

    // Wait for any ongoing fetch if it exists
    if (ANIME1_LIST_CACHE.fetchPromise) return ANIME1_LIST_CACHE.fetchPromise;

    // Start a new fetch and cache the promise
    ANIME1_LIST_CACHE.fetchPromise = (async () => {
        try {
            console.log("Fetching anime data from source...");
            const response = await fetch("https://d1zquzjgwo9yb.cloudfront.net/");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const rawList = await response.json();
            ANIME1_LIST_CACHE.data = rawList.map(([id, title, episodes, year, season, subtitleGroup]) => ({
                id,
                title,
                episodes,
                year,
                season,
                subtitleGroup,
            }));

            ANIME1_LIST_CACHE.timestamp = currentTime;
            ANIME1_LIST_CACHE.fetchPromise = null;
            return ANIME1_LIST_CACHE.data;
        } catch (error) {
            console.error("Error fetching anime data:", error);
            ANIME1_LIST_CACHE.fetchPromise = null; // Reset on error to allow retries
            throw error;
        }
    })();

    return ANIME1_LIST_CACHE.fetchPromise;
}

export async function cfFetch(url) {
    try {
        const now = Date.now()

        const cached = RESPONSE_CACHE.get(url)
        if (cached && now - cached.timestamp < CACHE_LIFETIME) {
            console.log(`Cache hit for: ${url} (${cached.html.length} bytes)`)
            return cached
        }

        const response = await fetch(url)
        if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}}`) }

        const html = await response.text()
        const result = { html, timestamp: now }

        RESPONSE_CACHE.set(url, result)
        if (RESPONSE_CACHE.size > 200) {
            const firstKey = RESPONSE_CACHE.keys().next().value
            RESPONSE_CACHE.delete(firstKey)
        }

        return result
    } catch (error) {
        return null;
    }
}
