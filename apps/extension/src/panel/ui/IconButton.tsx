import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function IconButton({
    label,
    className = '',
    children,
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            {...rest}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50 ${className}`}
        >
            {children}
        </button>
    );
}
