// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PanelRequest, PanelResponse, PublicSession } from '../lib/messages';
import { sessionWith } from '../test/sessions';
import { Popup } from './Popup';

const idle: PublicSession = {
    status: 'idle', roomId: null, me: null, isHost: false, room: null, mediaTab: null, mySync: null,
    serverUrl: 'https://s', error: null, volumeGain: 1, volumeReady: false, unread: 0,
};

function props(over: Partial<Parameters<typeof Popup>[0]> = {}) {
    const send = vi.fn(async (_r: PanelRequest): Promise<PanelResponse> => ({ ok: true, state: idle }));
    return { session: idle as PublicSession | null, send, openPanel: vi.fn(), activeTab: null, extensionId: 'abc', ...over };
}

describe('Popup', () => {
    it('offers to open the panel when there is no party', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Popup {...p} />);
        expect(screen.getByText('Sync & Watch Together')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Open Full Sidebar' }));
        expect(p.openPanel).toHaveBeenCalled();
    });

    it('shows the party at a glance', async () => {
        const user = userEvent.setup();
        const p = props({ session: sessionWith({ isHost: true }) });
        render(<Popup {...p} />);
        expect(screen.getByText('Luca')).toBeInTheDocument();
        expect(screen.getByText('Host')).toBeInTheDocument();
        expect(screen.getByText('Jol4I72BE4')).toBeInTheDocument();
        expect(screen.getByText('2 people')).toBeInTheDocument();
        expect(screen.getByLabelText('Connected')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Open Full Sidebar' }));
        expect(p.openPanel).toHaveBeenCalled();
    });

    it('has the Volume Boost slider like the sidebar', async () => {
        const p = props({ session: sessionWith({ mediaTab: { tabId: 7, title: 'Song' } }), activeTab: { tabId: 7 } });
        render(<Popup {...p} />);
        const slider = screen.getByRole('slider', { name: 'Volume Boost' });
        expect(slider).toHaveAttribute('max', '600');
        fireEvent.change(slider, { target: { value: '450' } });
        fireEvent.pointerUp(slider);
        await vi.waitFor(() => expect(p.send).toHaveBeenCalledWith({ type: 'volume.set', gain: 4.5 }));
        expect(screen.getByText('450%')).toBeInTheDocument();
        fireEvent.doubleClick(slider);
        await vi.waitFor(() => expect(p.send).toHaveBeenCalledWith({ type: 'volume.set', gain: 1 }));
        expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('arms volume boost when opened on the party video tab', () => {
        const p = props({ session: sessionWith({ mediaTab: { tabId: 7, title: 'Song' } }), activeTab: { tabId: 7 } });
        render(<Popup {...p} />);
        expect(p.send).toHaveBeenCalledWith({ type: 'volume.arm', tabId: 7 });
    });

    it('does not arm volume on another tab', () => {
        const p = props({ session: sessionWith({ mediaTab: { tabId: 7, title: 'Song' } }), activeTab: { tabId: 3 } });
        render(<Popup {...p} />);
        expect(p.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'volume.arm' }));
    });
});
