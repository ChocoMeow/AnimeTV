/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    './app/**/*.{vue,js,ts,jsx,tsx}',
    './app.vue',
    './error.vue',
  ],
  theme: {
    extend: {
      colors: {
        // Real, modern "true dark" surface (Netflix/YouTube/Apple style) instead of
        // Tailwind's default blue-tinted gray-950. Only the 950 shade is overridden so
        // every existing `dark:bg-gray-950` / `dark:text-gray-950` usage across the app
        // automatically picks up the new neutral near-black tone.
        gray: {
          950: '#0a0a0a',
        },
      },
    },
  },
  plugins: [],
}