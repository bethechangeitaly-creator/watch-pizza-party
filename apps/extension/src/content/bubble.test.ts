// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BubbleState } from '../lib/messages';
import { createBubble } from './bubble';
import { memoryStorage } from '../test/memoryArea';

let storage = memoryStorage();

const state: BubbleState = { visible: true, participants: 3, unread: 0, connected: true, request: null };
const host = () => document.querySelector('wpp-bubble') as HTMLElement;
const shadow = () => host().shadowRoot!;

afterEach(() => {
    document.body.innerHTML = '';
    storage = memoryStorage();
});

describe('bubble', () => {
    it('shows a pizza instead of a broken image if the logo cannot load', () => {
        const b = createBubble(document, { onOpen: vi.fn(), onDismiss: vi.fn() }, storage, 'chrome-extension://invalid/icon32.png');
        b.render(state);
        const img = shadow().querySelector('img')!;
        img.dispatchEvent(new Event('error'));
        expect(shadow().querySelector('img')).toBeNull();
        expect(shadow().textContent).toContain('🍕');
    });

    it('renders and hides', () => {
        const b = createBubble(document, { onOpen: vi.fn(), onDismiss: vi.fn() }, storage);
        b.render(state);
        expect(shadow().textContent).toContain('3');
        expect(host().style.display).not.toBe('none');
        b.render({ ...state, visible: false });
        expect(host().style.display).toBe('none');
    });

    it('caps unread at 99+', () => {
        const b = createBubble(document, { onOpen: vi.fn(), onDismiss: vi.fn() }, storage);
        b.render({ ...state, unread: 120 });
        expect(shadow().querySelector('[data-unread]')?.textContent).toBe('99+');
        b.render({ ...state, unread: 0 });
        expect(shadow().querySelector('[data-unread]')).toBeNull();
    });

    it('shows the request badge', () => {
        const b = createBubble(document, { onOpen: vi.fn(), onDismiss: vi.fn() }, storage);
        b.render({ ...state, request: 'pause' });
        expect(shadow().querySelector('[data-request="pause"]')).not.toBeNull();
    });

    it('click opens, context menu then close dismisses', () => {
        const onOpen = vi.fn();
        const onDismiss = vi.fn();
        const b = createBubble(document, { onOpen, onDismiss }, storage);
        b.render(state);
        shadow().querySelector<HTMLButtonElement>('[data-open]')!.click();
        expect(onOpen).toHaveBeenCalledTimes(1);
        shadow().querySelector('[data-open]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        shadow().querySelector<HTMLButtonElement>('[data-close]')!.click();
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('restores the saved position', () => {
        storage.setItem('wpp.bubble.top', '200');
        const b = createBubble(document, { onOpen: vi.fn(), onDismiss: vi.fn() }, storage);
        b.render(state);
        expect(host().style.top).toBe('200px');
    });

    it('destroy removes it', () => {
        const b = createBubble(document, { onOpen: vi.fn(), onDismiss: vi.fn() }, storage);
        b.render(state);
        b.destroy();
        expect(document.querySelector('wpp-bubble')).toBeNull();
    });
});
