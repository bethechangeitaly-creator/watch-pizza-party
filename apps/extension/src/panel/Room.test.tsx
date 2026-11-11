// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PanelRequest, PanelResponse } from '../lib/messages';
import { sessionWith } from '../test/sessions';
import { DONATE_URL } from './donate';
import { Room } from './Room';
import { requestPrimeAccess } from '../lib/primeAccess';

vi.mock('../lib/primeAccess', () => ({ requestPrimeAccess: vi.fn(async () => true) }));
import { defaultSections, type SectionState } from './sections';

function props(over: Partial<Parameters<typeof Room>[0]> = {}) {
    const session = over.session ?? sessionWith({ mySync: 'synced' });
    const send = vi.fn(async (_r: PanelRequest): Promise<PanelResponse> => ({ ok: true, state: session }));
    return {
        session, entries: [], send, activeTab: { tabId: 1, url: 'https://example.com/' }, extensionId: 'abc', version: '2.0.0',
        themePref: 'dark' as const, onThemeChange: vi.fn(), soundsEnabled: false, onSoundsChange: vi.fn(), gifsAvailable: false,
        sections: defaultSections(session.isHost ? 'host' : 'viewer') as SectionState, onToggleSection: vi.fn(),
        donateDue: false, onDonateDismiss: vi.fn(), primeAllowed: true,
        ...over,
    };
}
const host = () => sessionWith({ isHost: true, playing: true });

describe('Room', () => {
    it('every section starts folded', () => {
        render(<Room {...props()} />);
        for (const name of [/Invite to Join/, /Ask host/, /Participants/, /Volume Boost/]) {
            expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
        }
    });

    it('host: Sync Now sits in the header and syncs everyone; there is no Ask host section', async () => {
        const user = userEvent.setup();
        const h = props({ session: host() });
        render(<Room {...h} />);
        await user.click(screen.getByRole('button', { name: 'Sync Now' }));
        expect(h.send).toHaveBeenCalledWith({ type: 'sync.force' });
        expect(screen.queryByRole('button', { name: /Ask host/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Actions/ })).toBeNull();
    });

    it('guest: no Sync Now button; "Ask host:" has the four asks', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Room {...p} sections={{ ...p.sections, sync: true }} />);
        expect(screen.queryByRole('button', { name: 'Sync Now' })).toBeNull();
        expect(screen.queryByText(/Sync Now/)).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Ask host: pause' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'sync.request', reason: 'pause' });
    });

    it('folding a section reports the toggle', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: /Invite to Join/ }));
        expect(p.onToggleSection).toHaveBeenCalledWith('invite');
    });

    it('leave asks for confirmation', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Leave room' }));
        expect(screen.getByText('Leave the party?')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'session.leave' });
    });

    it('theme button switches between Night and Light', async () => {
        const user = userEvent.setup();
        const p = props();
        const { rerender } = render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Switch to light mode (work / YouTube)' }));
        expect(p.onThemeChange).toHaveBeenLastCalledWith('light');
        rerender(<Room {...p} themePref="light" />);
        await user.click(screen.getByRole('button', { name: 'Switch to dark mode (cinema / Netflix)' }));
        expect(p.onThemeChange).toHaveBeenLastCalledWith('dark');
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
        const people = screen.getByRole('list', { name: 'Participants' });
        expect(people).toHaveTextContent('Luca');
        expect(people).toHaveTextContent('You');
        expect(people).toHaveTextContent('Marco');
        expect(people).toHaveTextContent('Host');
    });

    it('volume slider double-click resets to 100%', () => {
        const p = props();
        render(<Room {...p} sections={{ ...p.sections, volume: true }} />);
        fireEvent.doubleClick(screen.getByRole('slider', { name: 'Volume Boost' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'volume.set', gain: 1 });
    });

    it('controls area is capped and scrolls, chat stays', () => {
        render(<Room {...props()} />);
        const controls = screen.getByRole('region', { name: 'Party controls' });
        expect(controls.className).toContain('max-h-[55%]');
        expect(controls.className).toContain('overflow-y-auto');
        expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    });

    it('the donation card shows only when due, opens PayPal and can be put off', async () => {
        const user = userEvent.setup();
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        const p = props({ donateDue: true });
        render(<Room {...p} />);
        expect(screen.getByText('Support Our Free Server')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '🍕 Donate a Slice of Pizza' }));
        expect(open).toHaveBeenCalledWith(DONATE_URL, '_blank', 'noopener');
        await user.click(screen.getByRole('button', { name: 'Not now' }));
        expect(p.onDonateDismiss).toHaveBeenCalled();
    });

    it('volume explains the toolbar click until boost is ready', () => {
        const p = props();
        const { rerender } = render(<Room {...p} sections={{ ...p.sections, volume: true }} />);
        expect(screen.getByText(/click the Watch Pizza Party icon/i)).toBeInTheDocument();
        rerender(<Room {...p} session={{ ...p.session, volumeReady: true }} sections={{ ...p.sections, volume: true }} />);
        expect(screen.getByText(/Boost is ready/)).toBeInTheDocument();
    });

    it('the red power button confirms, leaves and closes the panel', async () => {
        const user = userEvent.setup();
        const close = vi.spyOn(window, 'close').mockImplementation(() => {});
        const p = props();
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Close extension' }));
        expect(screen.getByText('Close Extension?')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'volume.stop' });
        expect(p.send).toHaveBeenCalledWith({ type: 'session.leave' });
        expect(close).toHaveBeenCalled();
    });

    it('puts a crown on the host', () => {
        const p = props();
        render(<Room {...p} sections={{ ...p.sections, people: true }} />);
        const people = screen.getByRole('list', { name: 'Participants' });
        expect(within(people).getByTitle('Host')).toBeInTheDocument();
        expect(screen.getByText('2 Watching')).toBeInTheDocument();
    });

    it('shows the platform and video title', () => {
        render(<Room {...props({ session: host() })} />);
        const card = screen.getByRole('region', { name: 'Now Playing' });
        expect(card).toHaveTextContent('YouTube');
        expect(card).toHaveTextContent('Song');
    });

    it('a viewer allows Prime Video from the status button, then resyncs', async () => {
        const user = userEvent.setup();
        const session = sessionWith({ playing: true, mySync: 'synced' });
        session.room!.timeline = { ...session.room!.timeline!, platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' };
        const p = props({ session, primeAllowed: false });
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Allow Prime Video' }));
        expect(requestPrimeAccess).toHaveBeenCalled();
        expect(p.send).toHaveBeenCalledWith({ type: 'sync.resyncMe' });
    });

    it('status action sends its request', async () => {
        const user = userEvent.setup();
        const p = props({ session: sessionWith({ mySync: 'drifting' }) });
        render(<Room {...p} />);
        await user.click(screen.getByRole('button', { name: 'Resync' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'sync.resyncMe' });
    });
});
