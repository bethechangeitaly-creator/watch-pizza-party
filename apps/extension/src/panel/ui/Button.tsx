import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-accent-strong text-accent-fg hover:bg-accent-strong/90',
    secondary: 'bg-surface-2 text-text hover:bg-surface-2/70',
    ghost: 'bg-transparent text-text hover:bg-surface-2',
    danger: 'bg-bad text-bad-fg hover:opacity-90',
};

export function Button({
    variant = 'secondary',
    size = 'md',
    align = 'center',
    loading = false,
    className = '',
    children,
    disabled,
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: 'md' | 'sm';
    align?: 'center' | 'start';
    loading?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            {...rest}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={`inline-flex items-center ${align === 'center' ? 'justify-center' : 'justify-start'} gap-2 rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                size === 'md' ? 'h-9 px-4 text-body' : 'h-[30px] px-3 text-meta'
            } ${VARIANTS[variant]} ${className}`}
        >
            {loading && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
            {children}
        </button>
    );
}
