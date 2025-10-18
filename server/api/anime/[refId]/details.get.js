import * as cheerio from "cheerio"

async function scrapeAnimeDetailByRefId(refId) {
    try {
        if (!isValidNumberString(refId)) {
            throw new Error(`Invalid reference ID: "${refId}" is not a valid number.`);
        }

        const { html } = await cfFetch(`${ACG_GAMER_BASE_URL}acgDetail.php?s=${refId}`);
        const $ = cheerio.load(html);

        const categories = {
            staff: [],
            cast: [],
            music: []
        };

        let currentCategory = '';

        $(".wikiContent div").each((index, divElement) => {
            const header = $(divElement).text().trim();

            // Identify the current category based on headers
            if (header === '＜STAFF＞') {
                currentCategory = 'staff';
            } else if (header === '＜CAST＞') {
                currentCategory = 'cast';
            } else if (header === '＜MUSIC＞') {
                currentCategory = 'music';
            } else if (currentCategory) {
                const listItems = $(divElement).find('ul > li');
                listItems.each((i, liElement) => {
                    const text = $(liElement).text().trim();

                    if (currentCategory === 'music') {
                        // Handle music entries separately
                        const musicItem = {
                            name: text.replace('｜', '').split('：')[1]?.trim() || '',
                            composer: '',
                            lyricsist: ''
                        };

                        // Check for nested <ul> for composer and lyricist
                        const subListItems = $(liElement).next('ul').children('li');
                        subListItems.each((j, subLiElement) => {
                            const subText = $(subLiElement).text().trim();
                            if (subText.startsWith('｜作詞')) {
                                musicItem.lyricsist = subText.replace('｜作詞：', '').trim();
                            } else if (subText.startsWith('｜作曲')) {
                                musicItem.composer = subText.replace('｜作曲、編曲：', '').trim();
                            }
                        });

                        categories.music.push(musicItem);
                    } else if (currentCategory === 'staff') {
                        // Split staff entries into name and role
                        const parts = text.split('：');
                        const staffItem = {
                            role: parts[0].replace('｜', '').trim(),
                            name: parts[1]?.trim() || ''
                        };
                        categories.staff.push(staffItem);
                    } else if (currentCategory === 'cast') {
                        // Split cast entries into name and character
                        const parts = text.split('：');
                        const castItem = {
                            character: parts[0].replace('｜', '').trim(),
                            name: parts[1]?.trim() || ''
                        };
                        categories.cast.push(castItem);
                    }
                });
            }
        });


        return categories; // Return the categorized items

    } catch (err) {
        console.error("Error scraping anime video detail:", err.message, err.stack);
        return null;
    }
}

export default defineEventHandler(async (event) => {
    const user = await authUser(event)

    const refId = getRouterParam(event, 'refId')

    try {
        const animeDetail = await scrapeAnimeDetailByRefId(refId)
        if (!animeDetail) {
            throw createError({ statusCode: 404, statusMessage: "Anime not found" })
        }

        return animeDetail
    } catch (error) {
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})