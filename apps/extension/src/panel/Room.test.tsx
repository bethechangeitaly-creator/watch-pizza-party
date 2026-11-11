// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PanelRequest, PanelResponse } from '../lib/messages';
import { sessionWith } from '../test/sessions';
import { Room } from './Room';

function props(over: Partial<Parameters<typeof Room>[0]> = {}) {
    const session = sessionWith({ mySync: 'synced' });
    const send = vi.fn(async (_r: PanelRequest): Promise<PanelResponse> => ({ ok: true, state: session }));
    return {
        session, entries: [], send, activeTabId: 1, extensionId: 'abc', version: '2.0.0',
        themePref: 'system' as const, onThemeChange: vi.fn(), soundsEnabled: false, onSoundsChange: vi.fn(),
        gifsAvailable: false, donate: false, onDonateClose: vi.fn(), ...over,
    };
}

describe('Room', () => {
    it('keeps settings in the menu, not on the main view', async () => {
        const user = userEvent.setup();
        render(<Room {...props()} />);
        expect(screen.getByText('In sync')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
        expect(screen.queryByRole('slider', { name: 'Volume boost' })).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Menu' }));
        expect(screen.getByRole('dialog', { name: 'Menu' })).toBeVisible();
        expect(screen.getByRole('slider', { name: 'Volume boost' })).toBeInTheDocument();
    });

    it('leave asks for confirmation', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Menu' }));
        await user.click(screen.getByRole('button', { name: 'Leave party' }));
        expect(screen.getByText('Leave the party?')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'session.leave' });
    });

    it('lists people with host and you tags', async () => {
        const user = userEvent.setup();
        render(<Room {...props()} />);
        await user.click(screen.getByRole('button', { name: /2 watching/ }));
        const dialog = screen.getByRole('dialog', { name: 'People' });
        expect(dialog).toHaveTextContent('Luca');
        expect(dialog).toHaveTextContent('You');
        expect(dialog).toHaveTextContent('Host');
    });

    it('status action sends its request', async () => {
        const user = userEvent.setup();
        const p = props({ session: sessionWith({ mySync: 'drifting' }) });
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Resync' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'sync.resyncMe' });
    });
});
