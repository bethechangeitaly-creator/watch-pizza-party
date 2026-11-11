import type { SyncRequestReason } from '@watch-party/shared';
import type { BubbleState } from '../lib/messages';

const TOP_KEY = 'wpp.bubble.top';
const SIZE = 56;
const MARGIN = 12;

// Dark tokens from the design spec (D7): the bubble always sits on top of video.
const CSS = `
:host { all: initial; }
.wrap { position: relative; width: ${SIZE}px; height: ${SIZE}px; font: 600 12px/16px ui-rounded, "SF Pro Rounded", ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; }
.open {
  all: unset; box-sizing: border-box; cursor: pointer; width: ${SIZE}px; height: ${SIZE}px; border-radius: 14px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  background: rgb(36 20 26 / 0.92); border: 1px solid rgb(255 255 255 / 0.07);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: rgb(245 233 228);
}
.open:focus-visible { outline: 2px solid rgb(242 107 58); outline-offset: 2px; }
.icon { width: 24px; height: 24px; border-radius: 6px; display: block; }
.pizza { font-size: 20px; line-height: 24px; text-align: center; }
.count { display: flex; align-items: center; gap: 4px; color: rgb(179 154 148); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: rgb(179 154 148); }
.dot.on { background: rgb(110 231 164); }
.badge {
  position: absolute; top: -6px; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; font-weight: 800;
}
.unread { right: -6px; background: rgb(201 70 31); color: rgb(255 255 255); }
.request { left: -6px; background: rgb(42 23 25); color: rgb(245 233 228); border: 1px solid rgb(255 255 255 / 0.07); }
.request svg { width: 12px; height: 12px; }
.close {
  all: unset; position: absolute; bottom: -8px; right: -8px; width: 20px; height: 20px; border-radius: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; background: rgb(42 23 25); color: rgb(245 233 228);
  border: 1px solid rgb(255 255 255 / 0.07);
}
.close svg { width: 10px; height: 10px; }
`;

const ICON_PATHS: Record<SyncRequestReason | 'close', string> = {
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    play: 'M7 4l13 8-13 8z',
    back: 'M11 6l-8 6 8 6V6zm10 0l-8 6 8 6V6z',
    forward: 'M13 6l8 6-8 6V6zM3 6l8 6-8 6V6z',
    resync: 'M12 4a8 8 0 017.7 6h-2.1A6 6 0 006.3 8.3L9 11H3V5l1.9 1.9A8 8 0 0112 4zm-7.7 10h2.1a6 6 0 0011.3 1.7L15 13h6v6l-1.9-1.9A8 8 0 014.3 14z',
    close: 'M5 5l14 14M19 5L5 19',
};

function svg(doc: Document, name: keyof typeof ICON_PATHS): SVGSVGElement {
    const el = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON_PATHS[name]);
    if (name === 'close') {
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('stroke-linecap', 'round');
    } else {
        path.setAttribute('fill', 'currentColor');
    }
    el.appendChild(path);
    return el;
}

export function createBubble(
    doc: Document,
    handlers: { onOpen(): void; onDismiss(): void },
    storage: Storage = localStorage,
    iconUrl = '',
): { render(state: BubbleState): void; destroy(): void } {
    const host = doc.createElement('wpp-bubble');
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    const wrap = doc.createElement('div');
    wrap.className = 'wrap';
    root.append(style, wrap);

    Object.assign(host.style, { position: 'fixed', right: `${MARGIN}px`, zIndex: '2147483646', display: 'none' });

    const clampTop = (value: number) => Math.round(Math.min(Math.max(MARGIN, value), Math.max(MARGIN, (doc.defaultView?.innerHeight ?? 800) - SIZE - MARGIN)));
    let top = clampTop(Number(storage.getItem(TOP_KEY)) || (doc.defaultView?.innerHeight ?? 800) * 0.45);
    host.style.top = `${top}px`;

    // Drag vertically; a drag never counts as a click.
    let drag: { startY: number; startTop: number; moved: boolean } | null = null;
    let suppressClickUntil = 0;
    let closeVisible = false;

    const mount = () => {
        const parent = doc.fullscreenElement ?? doc.body;
        if (parent && host.parentElement !== parent) parent.appendChild(host);
    };
    const onFullscreen = () => mount();
    doc.addEventListener('fullscreenchange', onFullscreen);

    let current: BubbleState | null = null;

    function render(state: BubbleState): void {
        current = state;
        mount();
        host.style.display = state.visible ? 'block' : 'none';
        wrap.replaceChildren();

        const open = doc.createElement('button');
        open.className = 'open';
        open.dataset.open = '';
        open.type = 'button';
        open.setAttribute('aria-label', 'Open Watch Pizza Party');
        if (iconUrl) {
            const img = doc.createElement('img');
            img.className = 'icon';
            img.src = iconUrl;
            img.alt = '';
            // Never show a broken-image icon: fall back to the pizza emoji.
            img.addEventListener('error', () => {
                const pizza = doc.createElement('span');
                pizza.className = 'icon pizza';
                pizza.textContent = '🍕';
                img.replaceWith(pizza);
            });
            open.appendChild(img);
        }
        const count = doc.createElement('span');
        count.className = 'count';
        const dot = doc.createElement('span');
        dot.className = state.connected ? 'dot on' : 'dot';
        count.append(dot, doc.createTextNode(String(state.participants)));
        open.appendChild(count);
        wrap.appendChild(open);

        if (state.unread > 0) {
            const badge = doc.createElement('span');
            badge.className = 'badge unread';
            badge.dataset.unread = '';
            badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
            wrap.appendChild(badge);
        }
        if (state.request) {
            const badge = doc.createElement('span');
            badge.className = 'badge request';
            badge.dataset.request = state.request;
            badge.appendChild(svg(doc, state.request));
            wrap.appendChild(badge);
        }
        if (closeVisible) {
            const close = doc.createElement('button');
            close.className = 'close';
            close.dataset.close = '';
            close.type = 'button';
            close.setAttribute('aria-label', 'Hide bubble');
            close.appendChild(svg(doc, 'close'));
            close.addEventListener('click', (event) => {
                event.stopPropagation();
                closeVisible = false;
                handlers.onDismiss();
            });
            wrap.appendChild(close);
        }

        open.addEventListener('click', () => {
            if (Date.now() < suppressClickUntil) return;
            handlers.onOpen();
        });
        open.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            closeVisible = true;
            if (current) render(current);
        });
        open.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            drag = { startY: event.clientY, startTop: top, moved: false };
            open.setPointerCapture?.(event.pointerId);
        });
        open.addEventListener('pointermove', (event) => {
            if (!drag) return;
            const delta = event.clientY - drag.startY;
            if (Math.abs(delta) > 3) drag.moved = true;
            top = clampTop(drag.startTop + delta);
            host.style.top = `${top}px`;
        });
        const endDrag = () => {
            if (drag?.moved) {
                suppressClickUntil = Date.now() + 250;
                storage.setItem(TOP_KEY, String(top));
            }
            drag = null;
        };
        open.addEventListener('pointerup', endDrag);
        open.addEventListener('pointercancel', endDrag);
    }

    return {
        render,
        destroy: () => {
            doc.removeEventListener('fullscreenchange', onFullscreen);
            host.remove();
        },
    };
}
