import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const CLOSE_DRAG_PX = 80;

/** Bottom sheet inside the panel: slides up; drag the handle down, Escape, backdrop or ✕ close it. Focus stays inside. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const dragStart = useRef<number | null>(null);
    const [drag, setDrag] = useState(0);
    const [entered, setEntered] = useState(false);

    useEffect(() => {
        if (!open) {
            setEntered(false);
            setDrag(0);
            return;
        }
        const frame = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(frame);
    }, [open]);

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        dragStart.current = e.clientY;
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (dragStart.current === null) return;
        setDrag(Math.max(0, e.clientY - dragStart.current));
    };
    const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
        if (dragStart.current === null) return;
        const moved = e.clientY - dragStart.current;
        dragStart.current = null;
        setDrag(0);
        if (moved > CLOSE_DRAG_PX) onClose();
    };

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
                className="relative max-h-[85vh] overflow-y-auto rounded-t-sheet bg-surface px-4 pb-4"
                style={{
                    transform: entered ? `translateY(${drag}px)` : 'translateY(100%)',
                    transition: dragStart.current === null ? 'transform 200ms ease-out' : 'none',
                }}
            >
                <div
                    data-testid="sheet-handle"
                    className="-mx-4 cursor-grab touch-none select-none px-4 pb-3 pt-3 active:cursor-grabbing"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                >
                    <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted/40" aria-hidden="true" />
                    <h2 id={titleId} className="pr-10 text-title font-bold">{title}</h2>
                </div>
                {children}
                <button
                    type="button"
                    aria-label="Close"
                    title="Close"
                    onClick={onClose}
                    className="absolute right-3 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-text"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
