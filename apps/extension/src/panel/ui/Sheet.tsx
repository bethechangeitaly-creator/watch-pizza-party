import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Bottom sheet inside the panel: Escape / backdrop close it, focus stays inside and returns to the opener. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;
        openerRef.current = document.activeElement as HTMLElement | null;
        const panel = panelRef.current;
        panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !panel) return;
            const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            openerRef.current?.focus();
        };
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div data-testid="sheet-backdrop" className="absolute inset-0 bg-scrim" onClick={onClose} />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative max-h-[85vh] overflow-y-auto rounded-t-sheet bg-surface px-4 pb-4 pt-3"
            >
                <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-muted/30" aria-hidden="true" />
                <h2 id={titleId} className="mb-3 text-title font-semibold">{title}</h2>
                {children}
            </div>
        </div>
    );
}
