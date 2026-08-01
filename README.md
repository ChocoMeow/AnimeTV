# AnimeTV

<img align="right" width=130 alt="AnimeTV Logo" src="https://github.com/user-attachments/assets/58b62749-f7d5-405b-93e9-6249e3d25d3f" />

Welcome to **AnimeTV**, a project designed for anime enthusiasts in Taiwan and Hong Kong! This application provides an extensive collection of anime metadata and video streaming capabilities.

## Features

-   **Anime Metadata**: Fetches detailed information about various anime from [ani.gamer.com.tw](https://ani.gamer.com.tw).
-   **Video Streaming**: Streams from configurable sources — [anime1.me](https://anime1.me) (MP4) and [twxgct.com](https://www.twxgct.com) (HLS).
-   **User-Friendly Interface**: Built with Nuxt 4 for a seamless and responsive experience, including light / dark / system themes.
-   **Browse & Search**: Weekday schedule, spotlight, genre themes, filters, pagination, and header search with suggestions.
-   **Custom Video Player**: Theater mode, autoplay next episode, skip OP, playback speed, HLS quality picker, scrub thumbnails, fullscreen, and customizable keyboard shortcuts.
-   **Watch History**: Tracks viewing progress so you can resume where you left off.
-   **Favorite List**: Save favorite anime shows for easy access.
-   **Offline Downloads**: Download episodes for offline viewing (MP4 and HLS), with pause / resume / cancel and a download manager at `/offline-downloads`.
-   **PWA**: Installable progressive web app with offline fallback when the network is unavailable.
-   **Friend List**: Connect with friends, manage requests, and see live watching status.
-   **Profile Analytics**: Watch time, genre mix, top titles / studios, and an activity heatmap.
-   **User Settings**: Themes, history preferences, data clearing, and shortcut customization.
-   **AI Assistant**: Floating chat helper for anime Q&A, recommendations, history/favorites lookup, and confirmed settings changes (requires privacy consent).
-   **Admin**: Role-gated metadata search and CRUD for administrators.

## Screenshot
<img width="1920" height="960" alt="screenshot" src="https://github.com/user-attachments/assets/9d084562-24e6-4984-baa2-ff5b4c1257fe" />


## Getting Started


To get started with AnimeTV, follow these steps:

### Prerequisites

Make sure you have the following installed:

-   [Bun](https://bun.sh) (latest stable version)
-   Supabase CLI (or use `bunx supabase` as shown below)

### Setup

1. **Clone the repository**:

    ```bash
    git clone https://github.com/ChocoMeow/AnimeTV.git
    cd animetv
    ```

2. **Install dependencies**:

    ```bash
    bun install
    ```

3. **Import Supabase**:

    To import your Supabase project using the Supabase CLI, follow these steps:

    - Link your project:

        ```bash
        bunx supabase link
        ```

    - Import the provided schema into your Supabase database:

        ```bash
        psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" -f schema.sql
        ```
        > You can find your database URL in your Supabase project under **Settings → Database → Connection string**.

    - Update your `.env` file with the necessary credentials:

        ```plaintext
        # Supabase (required)
        NUXT_PUBLIC_SUPABASE_URL=your_supabase_url
        NUXT_PUBLIC_SUPABASE_KEY=your_supabase_key
        NUXT_SUPABASE_SECRET_KEY=your_supabase_secret_key

        # Optional: AI assistant
        # NUXT_PUBLIC_AI_ENABLED=true
        # NUXT_AI_API_KEY=your_ai_api_key
        # NUXT_AI_BASE_URL=https://api.openai.com/v1
        # NUXT_AI_MODEL=gpt-4o-mini
        # NUXT_AI_PROXY_URL=http://127.0.0.1:8080

        # Optional: FlareSolverr for Cloudflare (https://github.com/FlareSolverr/FlareSolverr)
        # NUXT_CF_FETCH_FLARESOLVERR=http://127.0.0.1:8191/v1

        # Optional: video proxy (low-RAM-friendly defaults)
        # NUXT_VIDEO_PROXY_CHUNK=524288          # initial progressive Range size (bytes), default 512 KiB
        # NUXT_VIDEO_PROXY_MAX_CHUNK=1048576     # max bytes per progressive response, default 1 MiB
        # NUXT_VIDEO_PROXY_META_CACHE=128        # HEAD metadata cache entries
        # NUXT_VIDEO_PROXY_TIMEOUT_MS=25000      # upstream fetch timeout
        # NUXT_VIDEO_PROXY_RETRIES=2             # retry count on transient upstream errors

        # Optional: server logging
        # NUXT_LOG_LEVEL=info
        # NUXT_LOG_MAX_DAYS=30
        # NUXT_LOG_TO_FILE=true
        ```
        > Replace Supabase values from **Supabase → Settings → API**. Set `NUXT_PUBLIC_AI_ENABLED=true` to show the AI widget. All app env vars use the `NUXT_` prefix.
4. **Run the development server**:

    ```bash
    bun run dev
    ```

    Your application will be running at `http://localhost:3000`.

## License

This project is licensed under the GPL 3.0 License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

-   [Nuxt.js](https://nuxtjs.org) for the powerful framework.
-   [Supabase](https://supabase.io) for the backend database services.
-   [ani.gamer.com.tw](https://ani.gamer.com.tw) for anime metadata.
-   [anime1.me](https://anime1.me) for video content.
-   [twxgct.com](https://www.twxgct.com) for alternate HLS video content.

## Disclaimer

This project is intended solely for educational and research purposes. It does not engage in web scraping or intellectual copyright infringement. All content is sourced in compliance with the respective terms of service of the providers. Please support the original creators and platforms.

---

Happy watching! Enjoy exploring AnimeTV!
