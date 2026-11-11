import { useId, type InputHTMLAttributes } from 'react';

export function TextField({
    label,
    hint,
    error,
    mono = false,
    className = '',
    ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null; mono?: boolean }) {
    const id = useId();
    const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            <label htmlFor={id} className="text-meta text-muted">{label}</label>
            <input
                id={id}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                {...rest}
                className={`h-9 rounded-control bg-surface-2 px-3 text-body text-text placeholder:text-muted/70 ${mono ? 'font-mono' : ''} ${
                    error ? 'outline outline-1 outline-danger' : ''
                }`}
            />
            {error ? (
                <p id={`${id}-error`} className="text-meta text-danger">{error}</p>
            ) : hint ? (
                <p id={`${id}-hint`} className="text-meta text-muted">{hint}</p>
            ) : null}
        </div>
    );
}
