# AnimeTV

<img align="right" src="https://github.com/ChocoMeow/Anime-Hub/blob/main/public/icons/icon_512x512.png" width=130 alt="AnimeTV Logo">

Welcome to **AnimeTV**, a project designed for anime enthusiasts in Taiwan and Hong Kong! This application provides an extensive collection of anime metadata and video streaming capabilities.

## Features

- **Anime Metadata**: Fetches detailed information about various anime from [ani.gamer.com.tw](https://ani.gamer.com.tw).
- **Video Streaming**: Provides video content sourced from [anime1.me](https://anime1.me).
- **User-Friendly Interface**: Built with Nuxt 4.1.3 for a seamless and responsive experience.

## Getting Started

To get started with the AnimeTV, follow these steps:

### Prerequisites

Make sure you have the following installed:

- Node.js (version 22 or later)
- npm or Yarn

### Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/ChocoMeow/Anime-Hub.git
   cd anime-hub
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Environment Variables**:

   You need to set up the following environment variables in a `.env` file in the root of your project:

   ```plaintext
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   ```

   Replace `your_supabase_url` and `your_supabase_key` with your actual Supabase credentials.

4. **Run the development server**:

   ```bash
   npm run dev
   ```

   Your application will be running at `http://localhost:3000`.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Nuxt.js](https://nuxtjs.org) for the powerful framework.
- [Supabase](https://supabase.io) for the backend database services.
- [ani.gamer.com.tw](https://ani.gamer.com.tw) for anime metadata.
- [anime1.me](https://anime1.me) for video content.

## Disclaimer

This project is intended solely for educational and research purposes. It does not engage in web scraping or intellectual copyright infringement. All content is sourced in compliance with the respective terms of service of the providers. Please support the original creators and platforms.

---

Happy watching! Enjoy exploring AnimeTV!