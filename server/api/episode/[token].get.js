import { getRequestLogger, logError } from '~~/server/utils/logger'

// import { cfFetch } from "~~/server/utils/anime"

// export default defineEventHandler(async (event) => {
//     const { token } = event.context.params
//     const encodedBody = `d=${token}`

//     try {
//         const { html, cookies } = await cfFetch("https://v.anime1.me/api", {
//             method: "POST",
//             postData: encodedBody
//         })

//         // Extract JSON from the HTML response
//         let jsonText = html
//         const preMatch = html.match(/<pre>(.*?)<\/pre>/s)
//         if (preMatch) {
//             jsonText = preMatch[1]
//         }

//         // Parse the JSON response
//         let result
//         try {
//             result = JSON.parse(jsonText)
//         } catch (parseError) {
//             throw new Error("Invalid JSON response from server")
//         }

//         const data = {
//             ...result,
//             videoCookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ').replace(/;\s*$/, "")
//         }
//         return data
//     } catch (err) {
//         return { error: err.message || "Failed to fetch video" }
//     }
// })


// // Extract only specific video cookies (e, p, h, _ga)
// function extractVideoCookies(cookies) {
//     if (!cookies || !Array.isArray(cookies)) return ""

//     let finalCookie = ""

//     cookies.forEach((cookie) => {
//         const key = cookie.name
//         const value = cookie.value

//         if (key === "e" || key === "p" || key === "h" || key.startsWith("_ga")) {
//             finalCookie += `${key}=${value}; `
//         }
//     })
//     return finalCookie.replace(/;\s*$/, "")
// }

function videoCookieC(rawSetCookieHeader) {
    let finalCookie = '';

    // Split the raw header into individual cookie strings
    const baseCookies = rawSetCookieHeader.split(',');

    baseCookies.forEach(cookieString => {
        const parts = cookieString.trim().split(';')[0].split('=');
        const key = parts[0];
        const value = parts[1];

        if (key === 'e' || key === 'p' || key === 'h' || key.startsWith('_ga')) {
            finalCookie += `${key}=${value}; `;
        }
    });

    // Remove trailing semicolon and space
    return finalCookie.replace(/;\s*$/, '');
}

export default defineEventHandler(async (event) => {
    await authUser(event)
    const log = getRequestLogger(event)

    const { token } = event.context.params;
    const encodedBody = `d=${token}`;

    try {
        const response = await fetch("https://v.anime1.me/api", {
            method: "POST",
            headers: {
                "accept": "*/*",
                "content-type": "application/x-www-form-urlencoded",
            },
            credentials: "include",
            body: encodedBody,
        });

        // Check if the response is OK
        if (!response.ok) {
            const errorResponse = await response.json();
            throw new Error(errorResponse.message || "Failed to fetch video");
        }

        // Get the Set-Cookie header from the response
        const setCookieHeader = response.headers.get('set-cookie');
        log.debug({ hasVideoCookie: Boolean(setCookieHeader) }, 'Video cookie received')

        const result = await response.json();
        return {
            ...result,
            videoCookie: videoCookieC(setCookieHeader)
        }

    } catch (err) {
        logError(event, err, { module: 'episode' });
        return { error: err.message || "Failed to fetch video" };
    }
});
