// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PanelRequest, PanelResponse, PublicSession } from '../lib/messages';
import { Landing } from './Landing';

const idle: PublicSession = {
    status: 'idle', roomId: null, me: null, isHost: false, room: null, mediaTab: null, mySync: null,
    serverUrl: 'https://s', error: null, volumeGain: 1, unread: 0,
};

function props(over: Partial<Parameters<typeof Landing>[0]> = {}) {
    const send = vi.fn(async (_r: PanelRequest): Promise<PanelResponse> => ({ ok: true, state: idle }));
    return { session: idle, send, activeTab: null, onAbout: vi.fn(), ...over };
}

describe('Landing', () => {
    it('can start a party from any tab', async () => {
        const user = userEvent.setup();
        const p = props({ activeTab: { tabId: 1, url: 'https://www.youtube.com/' } });
        render(<Landing {...p} />);
        expect(screen.getByText('You can open a YouTube or Netflix video after starting.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Start a party' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'session.create', username: expect.any(String), tabId: 1 });
    });

    it('starts a party from a video tab', async () => {
        const user = userEvent.setup();
        const p = props({ activeTab: { tabId: 9, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Song' } });
        render(<Landing {...p} />);
        expect(screen.getByText('Using: Song')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Start a party' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'session.create', username: expect.any(String), tabId: 9 });
    });

    it('shows the waking note', () => {
        render(<Landing {...props({ session: { ...idle, status: 'waking' } })} />);
        expect(screen.getByText('Waking up the server — this can take up to a minute on the first party of the day.')).toBeInTheDocument();
    });

    it('rejects a bad code', async () => {
        const user = userEvent.setup();
        const p = props({ activeTab: { tabId: 2, url: 'https://example.com' } });
        render(<Landing {...p} />);
        await user.type(screen.getByLabelText('Room code'), 'hi');
        await user.click(screen.getByRole('button', { name: 'Join' }));
        expect(screen.getByText("That doesn't look like a room code.")).toBeInTheDocument();
        expect(p.send).not.toHaveBeenCalled();
    });

    it('joins with a pasted invite', async () => {
        const user = userEvent.setup();
        const p = props({ activeTab: { tabId: 2, url: 'https://example.com' } });
        render(<Landing {...p} />);
        await user.click(screen.getByLabelText('Room code'));
        await user.paste('Room code: Jol4I72BE4');
        await user.click(screen.getByRole('button', { name: 'Join' }));
        expect(p.send).toHaveBeenCalledWith({ type: 'session.join', roomId: 'Jol4I72BE4', username: expect.any(String), tabId: 2 });
    });

    it('says the video opens in a new tab when joining from another site', () => {
        const { unmount } = render(<Landing {...props({ activeTab: { tabId: 2, url: 'https://web.whatsapp.com/' } })} />);
        expect(screen.getByText('The video will open in a new tab.')).toBeInTheDocument();
        unmount();
        render(<Landing {...props({ activeTab: { tabId: 2, url: 'https://www.youtube.com/' } })} />);
        expect(screen.queryByText('The video will open in a new tab.')).toBeNull();
    });

    it('shows the session error', () => {
        render(<Landing {...props({ session: { ...idle, status: 'error', error: { code: 'room_not_found', message: 'Room not found. Check the code.' } } })} />);
        expect(screen.getByText('Room not found. Check the code.')).toBeInTheDocument();
    });
});
