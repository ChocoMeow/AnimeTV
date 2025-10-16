// import { cfFetch } from "~~/server/utils/anime"

// export default defineEventHandler(async (event) => {
//     const { token } = event.context.params
//     const encodedBody = `d=${token}`

//     try {
//         const { html, cookies } = await cfFetch("https://v.anime1.me/api", {
//             method: "POST",
//             postData: encodedBody
//         })

//         console.log(html, cookies)
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
//             console.error("Failed to parse response:", jsonText)
//             throw new Error("Invalid JSON response from server")
//         }

//         const data = {
//             ...result,
//             videoCookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ').replace(/;\s*$/, "")
//         }
//         console.log(data)
//         return data
//     } catch (err) {
//         console.error("Error fetching video data:", err)
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

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    
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
        console.debug("Video Cookie:", videoCookieC(setCookieHeader));

        const result = await response.json();
        return {
            ...result,
            videoCookie: videoCookieC(setCookieHeader)
        }

    } catch (err) {
        console.error("Error fetching video data:", err);
        return { error: err.message || "Failed to fetch video" };
    }
});

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