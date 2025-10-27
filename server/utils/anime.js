// Requires: npm install axios
// Requires: FlareSolverr running on http://localhost:8191
// import axios from "axios"

// const FLARESOLVERR_URL = "http://localhost:8191/v1"

// FlareSolverr session management
// let flaresolverrSession = null
// let flaresolverrSessionPromise = null
// let sessionCreatedAt = null
// const SESSION_LIFETIME = 1000 * 60 * 120 // 120 minutes

// Response cache to avoid redundant requests


// async function getFlareSolverrSession() {
//     const now = Date.now()

//     // If already creating a session, wait for that promise
//     if (flaresolverrSessionPromise) {
//         return flaresolverrSessionPromise
//     }

//     // Reuse existing session if it's still valid
//     if (flaresolverrSession && sessionCreatedAt && now - sessionCreatedAt < SESSION_LIFETIME) {
//         return flaresolverrSession
//     }

//     // Create promise for new session
//     flaresolverrSessionPromise = (async () => {
//         // Destroy old session if exists
//         if (flaresolverrSession) {
//             try {
//                 await axios.post(FLARESOLVERR_URL, {
//                     cmd: "sessions.destroy",
//                     session: flaresolverrSession,
//                 })
//             } catch (err) {
//                 console.log("Failed to destroy old session:", err.message)
//             }
//         }

//         // Create new session
//         try {
//             const response = await axios.post(FLARESOLVERR_URL, {
//                 cmd: "sessions.create",
//             })

//             if (response.data.status === "ok") {
//                 flaresolverrSession = response.data.session
//                 sessionCreatedAt = now
//                 console.log("Created new FlareSolverr session:", flaresolverrSession)
//                 return flaresolverrSession
//             }
//         } catch (err) {
//             console.error("Failed to create FlareSolverr session:", err.message)
//         }

//         return null
//     })()

//     const result = await flaresolverrSessionPromise
//     flaresolverrSessionPromise = null // Clear promise after completion
//     return result
// }


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

    let seasons = [];
    let isFinalSeason = false;
    let parts = [];
    let hasPart = false;
    let cleanTitle = title;

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

    return {
        baseTitle: cleanTitle,
        seasons: [...new Set(seasons)],
        hasSeason: seasons.length > 0,
        isFinalSeason,
        parts: [...new Set(parts)],
        hasPart
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
    const { baseTitle, seasons, hasSeason, isFinalSeason, parts, hasPart } = extractSeasonInfo(title);
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
        tokens: normalized.split(/\s+/).filter(t => t.length > 0)
    };
}

function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[len1][len2];
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

function calculateMatchScore(parsed1, parsed2) {
    const norm1 = parsed1.normalized;
    const norm2 = parsed2.normalized;

    let titleScore = 0;

    if (parsed1.chinesePart && parsed2.chinesePart) {
        const chineseLevenshtein = levenshteinSimilarity(parsed1.chinesePart, parsed2.chinesePart);
        const chineseJaroWinkler = jaroWinklerSimilarity(parsed1.chinesePart, parsed2.chinesePart);
        const chineseScore = (chineseLevenshtein * 0.5 + chineseJaroWinkler * 0.5);

        if (chineseScore > 0.8) {
            titleScore = chineseScore;
        }
    }

    if (titleScore < 0.8) {
        const levenshtein = levenshteinSimilarity(norm1, norm2);
        const jaroWinkler = jaroWinklerSimilarity(norm1, norm2);
        const tokenSet = tokenSetRatio(norm1, norm2);
        const bigram = ngramSimilarity(norm1, norm2, 2);
        const trigram = ngramSimilarity(norm1, norm2, 3);

        titleScore = Math.max(titleScore,
            levenshtein * 0.25 +
            jaroWinkler * 0.30 +
            tokenSet * 0.25 +
            bigram * 0.10 +
            trigram * 0.10
        );
    }

    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    const longer = norm1.length < norm2.length ? norm2 : norm1;
    if (longer.includes(shorter) && shorter.length > 3) {
        titleScore += (shorter.length / longer.length) * 0.15;
    }

    let seasonScore = 1.0;
    let seasonPenalty = 1.0;

    if (parsed1.hasSeason && parsed2.hasSeason) {
        // Check if there's any matching season
        const hasMatchingSeason = parsed1.seasons.some(s1 =>
            parsed2.seasons.includes(s1)
        );
        
        // Special handling for final season
        const bothFinal = parsed1.isFinalSeason && parsed2.isFinalSeason;
        const oneFinal = parsed1.isFinalSeason !== parsed2.isFinalSeason;
        
        if (hasMatchingSeason || bothFinal) {
            // Exact season match or both are final seasons
            seasonScore = 1.0;
            seasonPenalty = 1.0;
        } else if (oneFinal) {
            // One is final season, other is not - strong mismatch
            seasonScore = 0.1;
            seasonPenalty = 0.2;
        } else {
            // Different seasons (e.g., season 2 vs season 3)
            seasonScore = 0.2;
            seasonPenalty = 0.3;
        }
    } else if (!parsed1.hasSeason && !parsed2.hasSeason) {
        // Neither has season info
        seasonScore = 1.0;
        seasonPenalty = 1.0;
    } else {
        // One has season, one doesn't - moderate penalty
        seasonScore = 0.3;
        seasonPenalty = 0.4;
    }

    // Part matching logic
    let partScore = 1.0;
    let partPenalty = 1.0;

    if (parsed1.hasPart && parsed2.hasPart) {
        // Check if parts match
        const hasMatchingPart = parsed1.parts.some(p1 =>
            parsed2.parts.includes(p1)
        );
        
        if (hasMatchingPart) {
            // Same part (e.g., both Part 1)
            partScore = 1.0;
            partPenalty = 1.0;
        } else {
            // Different parts (e.g., Part 1 vs Part 2) - strong mismatch
            partScore = 0.1;
            partPenalty = 0.2;
        }
    } else if (!parsed1.hasPart && !parsed2.hasPart) {
        // Neither has part info
        partScore = 1.0;
        partPenalty = 1.0;
    } else {
        // One has part, one doesn't - moderate penalty
        partScore = 0.3;
        partPenalty = 0.4;
    }

    // Combine season and part penalties
    const combinedPenalty = seasonPenalty * partPenalty;

    // Apply combined penalty to title score
    const adjustedTitleScore = titleScore * combinedPenalty;

    // Combine season and part scores
    const combinedSeasonPartScore = (seasonScore * 0.6) + (partScore * 0.4);

    // Final weighted score
    const finalScore = Math.min(adjustedTitleScore * 0.80 + combinedSeasonPartScore * 0.20, 1.0);

    return {
        score: finalScore,
        titleScore,
        seasonScore,
        seasonPenalty,
        partScore,
        partPenalty,
        details: {
            norm1,
            norm2,
            chinesePart1: parsed1.chinesePart,
            chinesePart2: parsed2.chinesePart,
            seasons1: parsed1.seasons,
            seasons2: parsed2.seasons,
            hasSeason1: parsed1.hasSeason,
            hasSeason2: parsed2.hasSeason,
            isFinalSeason1: parsed1.isFinalSeason,
            isFinalSeason2: parsed2.isFinalSeason,
            parts1: parsed1.parts,
            parts2: parsed2.parts,
            hasPart1: parsed1.hasPart,
            hasPart2: parsed2.hasPart
        }
    };
}

function findBestMatches(query, candidates, threshold = 0.6, topN = 5) {
    const parsedQuery = parseTitle(query);

    const matches = candidates.map(candidate => {
        const parsedCandidate = parseTitle(candidate.title);
        const matchResult = calculateMatchScore(parsedQuery, parsedCandidate);

        return {
            ...candidate,
            ...matchResult,
            parsedTitle: parsedCandidate
        };
    });

    // Filter by threshold and sort by score
    return matches
        .filter(m => m.score >= threshold)
        .sort((a, b) => {
            // First sort by score
            if (Math.abs(a.score - b.score) > 0.05) {
                return b.score - a.score;
            }
            // If scores are close, prefer exact season matches
            if (a.seasonPenalty !== b.seasonPenalty) {
                return b.seasonPenalty - a.seasonPenalty;
            }
            return b.score - a.score;
        })
        .slice(0, topN);
}

export async function searchAnimeTitle(query, threshold = 0.70) {
    try {
        const animeList = await fetchAnimeData();
        const matches = findBestMatches(query, animeList, threshold);
        return matches;
    } catch (error) {
        console.error("Error searching anime title:", error);
        return [];
    }
}

export async function matchAnime(animeList, matchThreshold = 0.70) {
    if (!Array.isArray(animeList) || animeList.length === 0) {
        return [];
    }

    const results = await Promise.all(
        animeList.map(async (anime) => {
            try {
                if (!anime.title || !anime.refId) {
                    return null;
                }

                const matches = await searchAnimeTitle(anime.title, matchThreshold);

                if (!matches || matches.length === 0) {
                    console.warn(`No matches found for: ${anime.title}`);
                    return null;
                }

                // Prefer year match if available AND score is decent
                const premiereYear = anime.year?.split("/")?.[0]?.trim();
                let bestMatch = null;

                if (premiereYear) {
                    bestMatch = matches.find(m =>
                        String(m.year) === String(premiereYear) && m.score >= 0.70
                    );
                }

                // Otherwise take highest score
                if (!bestMatch) {
                    bestMatch = matches[0];
                }

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
                        partPenalty: bestMatch.partPenalty
                    },
                    allMatches: matches.slice(0, 3)
                };
            } catch (err) {
                console.error(`Error matching anime: ${anime.title}`, err);
                return null;
            }
        })
    );

    return results.filter(Boolean);
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

// export async function cfFetch(url, options = {}) {
//     const startTime = Date.now()
//     const now = Date.now()
//     const { method = "GET", body = null, headers = {}, postData = null } = options

//     // Create cache key that includes method and body for POST requests
//     const cacheKey = method === "POST" ? `${method}:${url}:${JSON.stringify(body || postData)}` : url

//     // Check cache first (you may want to disable caching for POST requests)
//     const cached = RESPONSE_CACHE.get(cacheKey)
//     if (cached && now - cached.timestamp < CACHE_LIFETIME) {
//         console.log(`Cache hit for: ${url} (${cached.html.length} bytes)`)
//         // Return the full cached object with cookies
//         return {
//             html: cached.html,
//             cookies: cached.cookies || [],
//             headers: cached.headers || {},
//         }
//     }

//     try {
//         // Get or create a session
//         const session = await getFlareSolverrSession()
//         console.log(`Fetching via FlareSolverr [${method}]: ${url}`)

//         const requestData = {
//             cmd: method === "POST" ? "request.post" : "request.get",
//             url: url,
//             maxTimeout: 60000,
//         }

//         // Add session if available
//         if (session) {
//             requestData.session = session
//         }

//         // Add POST data if provided
//         if (method === "POST" && (body || postData)) {
//             requestData.postData = postData || (typeof body === "string" ? body : JSON.stringify(body))
//         }

//         // Add custom headers if provided
//         if (Object.keys(headers).length > 0) {
//             requestData.headers = headers
//         }

//         const response = await axios.post(FLARESOLVERR_URL, requestData)
//         if (response.data.status === "ok") {
//             const html = response.data.solution.response
//             const cookies = response.data.solution.cookies || []
//             const responseHeaders = response.data.solution.headers || {}
//             const duration = ((Date.now() - startTime) / 1000).toFixed(2)

//             // Verify we didn't get a Cloudflare challenge page
//             if (html.includes("系統異常回報") || html.includes("Just a moment")) {
//                 console.error("Still got Cloudflare challenge page")
//                 return null
//             }

//             // Cache the response WITH cookies
//             RESPONSE_CACHE.set(cacheKey, {
//                 html: html,
//                 cookies: cookies,
//                 headers: responseHeaders,
//                 timestamp: now,
//             })

//             // Clean old cache entries (keep cache size manageable)
//             if (RESPONSE_CACHE.size > 100) {
//                 const firstKey = RESPONSE_CACHE.keys().next().value
//                 RESPONSE_CACHE.delete(firstKey)
//             }

//             console.log(`Successfully fetched [${method}] in ${duration}s: ${url} (${html.length} bytes)`)

//             // Return object with html, cookies, and headers
//             return {
//                 html: html,
//                 cookies: cookies,
//                 headers: responseHeaders,
//             }
//         } else {
//             console.error("FlareSolverr error:", response.data.message)
//             return null
//         }
//     } catch (error) {
//         const duration = ((Date.now() - startTime) / 1000).toFixed(2)
//         console.error(`FlareSolverr request failed after ${duration}s:`, error.message)
//         return null
//     }
// }
