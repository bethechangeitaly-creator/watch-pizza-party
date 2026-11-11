/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        colors: {
            transparent: 'transparent',
            current: 'currentColor',
            bg: token('bg'),
            surface: token('surface'),
            'surface-2': token('surface-2'),
            line: 'rgb(var(--line-rgb) / var(--line-a))',
            text: token('text'),
            muted: token('muted'),
            accent: token('accent'),
            'accent-fg': token('accent-fg'),
            success: token('success'),
            warning: token('warning'),
            danger: token('danger'),
            scrim: 'rgb(0 0 0 / 0.4)',
        },
        fontSize: {
            meta: ['12px', '16px'],
            body: ['13px', '18px'],
            title: ['15px', '20px'],
            display: ['20px', '26px'],
        },
        fontWeight: {
            normal: '400',
            medium: '500',
            semibold: '600',
        },
        fontFamily: {
            sans: ['ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
            mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
        },
        borderRadius: {
            none: '0',
            control: '10px',
            sheet: '14px',
            full: '9999px',
        },
        extend: {},
    },
    plugins: [],
};
