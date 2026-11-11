function readableTextOn(color: string): string {
    const hex = color.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return 'rgb(var(--accent-fg))';
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.45 ? 'rgb(var(--accent-fg))' : 'rgb(255 255 255)';
}

export function Avatar({ name, color, size = 24 }: { name: string; color: string; size?: 24 | 32 }) {
    return (
        <span
            aria-hidden="true"
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${size === 24 ? 'text-meta' : 'text-body'}`}
            style={{ width: size, height: size, background: color, color: readableTextOn(color) }}
        >
            {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
    );
}
