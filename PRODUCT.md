# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are anime fans in Taiwan and Hong Kong. They catch up on current-season and catalog titles at home or on the go (phone as an installed PWA, or desktop browser). The job is to find something to watch, play it, resume later, and optionally download for offline — in Traditional Chinese, without hopping across Bahamut, Anime1, and a player.

## Product Purpose

AnimeTV is a Traditional Chinese web app for exploring and watching anime: weekday schedule, search, streaming, watch history, favorites, offline downloads, friends, and an optional AI helper. Success is that a viewer finds the next episode, resumes where they left off, or takes a title offline, without leaving the product.

## Positioning

A Taiwan/Hong Kong convenience aggregator — not a licensed streaming service. It combines Bahamut Anime (ani.gamer.com.tw) metadata with configurable video sources (anime1.me MP4 and twxgct.com HLS), plus resume, offline downloads, friends with live watching status, and optional AI. A neighboring licensed catalog or a single source site could not truthfully claim that combination.

## Operating Context

Typical session: open the home weekday schedule (每日新番), scan spotlight and genre themes, search, open a title, watch in the custom player (theater, autoplay next, skip OP, speed, HLS quality, scrub thumbnails, fullscreen, keyboard shortcuts), then resume from history or save to favorites. Phone use is an installable PWA with a bottom nav; desktop keeps a header, footer, and a friend list drawer. Auth is Google or Discord via Supabase. Optional AI chat requires an explicit privacy consent before it can read history, favorites, or settings. Development runs with `bun run dev` at `http://localhost:3000`.

## Capabilities and Constraints

Confirmed functionality: browse and search; custom video player; watch history and resume; favorites; offline downloads; PWA with offline fallback; friend list and live watching status; profile analytics; settings; optional AI assistant; admin metadata tools; privacy and terms pages.

Product constraints: personal, non-commercial viewing only. The product does not claim rights to third-party titles or to be a licensed catalog. UI language is Traditional Chinese. The app stays a web PWA, not native iOS/Android. License is GPL-3.0.

Undecided: no product-specific accessibility standard was committed.

## Brand Commitments

- Name: AnimeTV
- Logo and app icons: `public/icons/`
- Product UI is Traditional Chinese (zh-TW / zh-HK audience)
- Public presence: [GitHub](https://github.com/ChocoMeow/AnimeTV), [Ko-fi](https://ko-fi.com/chocoo)
- Legal posture: educational/research framing, personal use, no invented rights

## Evidence on Hand

- Product copy and legal: `README.md`, `app/pages/terms.vue`, `app/pages/privacy.vue`
- Brand marks: `public/icons/`
- Screenshot: `public/screenshot.png`
- Do not invent titles, testimonials, customer names, or usage metrics

## Product Principles

1. Traditional Chinese TW/HK viewers come first.
2. Convenience aggregator, not a licensed catalog.
3. Continuity of watching is core: resume, offline, and PWA install matter.
4. Optional features stay consent-gated.
5. Stay open-source (GPL-3.0) and personal/non-commercial in copy and claims.
