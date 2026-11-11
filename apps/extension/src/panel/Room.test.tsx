// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PanelRequest, PanelResponse } from '../lib/messages';
import { sessionWith } from '../test/sessions';
import { DONATE_URL } from './donate';
import { Room } from './Room';
import { defaultSections, type SectionState } from './sections';

function props(over: Partial<Parameters<typeof Room>[0]> = {}) {
    const session = over.session ?? sessionWith({ mySync: 'synced' });
    const send = vi.fn(async (_r: PanelRequest): Promise<PanelResponse> => ({ ok: true, state: session }));
    return {
        session, entries: [], send, activeTab: { tabId: 1, url: 'https://example.com/' }, extensionId: 'abc', version: '2.0.0',
        themePref: 'system' as const, onThemeChange: vi.fn(), soundsEnabled: false, onSoundsChange: vi.fn(), gifsAvailable: false,
        sections: defaultSections(session.isHost ? 'host' : 'viewer') as SectionState, onToggleSection: vi.fn(),
        ...over,
    };
}
const host = () => sessionWith({ isHost: true, playing: true });

describe('Room', () => {
    it('host sees Invite and Sync open, People and Volume folded', () => {
        render(<Room {...props({ session: host() })} />);
        for (const name of ['Copy invite', 'WhatsApp', 'Email', '🔄 Sync everyone', '🍕 Donate a slice']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
        expect(screen.queryByRole('slider', { name: 'Volume boost' })).toBeNull();
        expect(screen.getByRole('button', { name: /People/ })).toHaveAttribute('aria-expanded', 'false');
    });

    it('viewer sees Resync me and the ask-the-host buttons', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Room {...p} />);
        expect(screen.getByRole('button', { name: '🔄 Resync me' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '🔄 Sync everyone' })).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Ask the host to pause' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'sync.request', reason: 'pause' });
    });

    it('folding a section reports the toggle', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: /Invite friends/ }));
        expect(p.onToggleSection).toHaveBeenCalledWith('invite');
    });

    it('leave asks for confirmation', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Leave party' }));
        expect(screen.getByText('Leave the party?')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'session.leave' });
    });

    it('theme button cycles system → light → dark → system', async () => {
        const user = userEvent.setup();
        const p = props();
        const { rerender } = render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Theme: System' }));
        expect(p.onThemeChange).toHaveBeenLastCalledWith('light');
        rerender(<Room {...p} themePref="light" />);
        await user.click(screen.getByRole('button', { name: 'Theme: Light' }));
        expect(p.onThemeChange).toHaveBeenLastCalledWith('dark');
        rerender(<Room {...p} themePref="dark" />);
        await user.click(screen.getByRole('button', { name: 'Theme: Night' }));
        expect(p.onThemeChange).toHaveBeenLastCalledWith('system');
    });

    it('shows you with your role, and a connection dot', () => {
        render(<Room {...props()} />);
        const you = screen.getByLabelText('You');
        expect(you).toHaveTextContent('Luca');
        expect(you).toHaveTextContent('Viewer');
        expect(screen.getByLabelText('Connected')).toBeInTheDocument();
    });

    it('people section lists names with You and Host', () => {
        const p = props();
        render(<Room {...p} sections={{ ...p.sections, people: true }} />);
        const people = screen.getByRole('list', { name: 'People' });
        expect(people).toHaveTextContent('Luca');
        expect(people).toHaveTextContent('You');
        expect(people).toHaveTextContent('Marco');
        expect(people).toHaveTextContent('Host');
    });

    it('volume slider double-click resets to 100%', () => {
        const p = props();
        render(<Room {...p} sections={{ ...p.sections, volume: true }} />);
        fireEvent.doubleClick(screen.getByRole('slider', { name: 'Volume boost' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'volume.set', gain: 1 });
    });

    it('controls area is capped and scrolls, chat stays', () => {
        render(<Room {...props()} />);
        const controls = screen.getByRole('region', { name: 'Party controls' });
        expect(controls.className).toContain('max-h-[55%]');
        expect(controls.className).toContain('overflow-y-auto');
        expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    });

    it('donate opens the PayPal page', async () => {
        const user = userEvent.setup();
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        render(<Room {...props()} />);
        await user.click(screen.getByRole('button', { name: '🍕 Donate a slice' }));
        expect(open).toHaveBeenCalledWith(DONATE_URL, '_blank', 'noopener');
    });

    it('status action sends its request', async () => {
        const user = userEvent.setup();
        const p = props({ session: sessionWith({ mySync: 'drifting' }) });
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Resync' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'sync.resyncMe' });
    });
});
