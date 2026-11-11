import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** A foldable card, like 1.2's sections: title + chevron, content only when open. */
export function Section({
    title,
    badge,
    open,
    onToggle,
    children,
}: {
    title: string;
    badge?: string;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    const contentId = useId();
    return (
        <section className="rounded-card bg-surface shadow-[0_1px_3px_rgb(120_60_20/0.08)] dark:shadow-none">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={contentId}
                onClick={onToggle}
                className="flex w-full items-center gap-2 rounded-card px-3 py-2.5 text-left text-body font-semibold text-text"
            >
                <span className="flex-1">
                    {title}
                    {badge && <span className="ml-1.5 font-medium text-muted">{badge}</span>}
                </span>
                <ChevronDown size={16} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
                <div id={contentId} className="px-3 pb-3">
                    {children}
                </div>
            )}
        </section>
    );
}
