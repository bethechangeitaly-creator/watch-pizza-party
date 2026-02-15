/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                ios: {
                    blue: '#007AFF',
                    gray: '#8E8E93',
                    bg: '#F2F2F7',
                }
            }
        },
    },
    plugins: [],
}
