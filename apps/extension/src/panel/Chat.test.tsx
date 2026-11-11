// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TimelineEntry } from '../lib/messages';
import { Chat } from './Chat';

const msg = (userId: string, username: string, timestamp: number, text = 'hi'): TimelineEntry => ({
    kind: 'chat', message: { id: `${userId}-${timestamp}`, userId, username, avatarColor: '#3DD68C', text, timestamp },
});

function props(over: Partial<Parameters<typeof Chat>[0]> = {}) {
    return {
        entries: [] as TimelineEntry[], meUserId: 'u1', soundsEnabled: false, onSend: vi.fn(), serverUrl: 'https://s',
        gifsAvailable: true, donate: false, onDonateClose: vi.fn(), ...over,
    };
}

describe('Chat', () => {
    it('renders a non-giphy image url as text, never as <img>', () => {
        render(<Chat {...props({ entries: [msg('u2', 'Luca', 0, 'https://evil.com/track.gif')] })} />);
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByText('https://evil.com/track.gif')).toBeInTheDocument();
    });

    it('renders giphy gifs as images', () => {
        render(<Chat {...props({ entries: [msg('u2', 'Luca', 0, 'https://media1.giphy.com/media/a/200.gif')] })} />);
        expect(screen.getByRole('img', { name: 'GIF' })).toHaveAttribute('src', 'https://media1.giphy.com/media/a/200.gif');
    });

    it('labels my own messages as You', () => {
        render(<Chat {...props({ entries: [msg('u1', 'Luca', 0, 'mine')] })} />);
        expect(screen.getByText('You')).toBeInTheDocument();
    });

    it('Enter sends, Shift+Enter adds a newline', async () => {
        const user = userEvent.setup();
        const p = props();
        render(<Chat {...p} />);
        await user.type(screen.getByRole('textbox', { name: 'Message' }), 'hi{Shift>}{Enter}{/Shift}there{Enter}');
        expect(p.onSend).toHaveBeenCalledWith('hi\nthere');
        expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    });

    it('hides the GIF button when the server has no key', () => {
        render(<Chat {...props({ gifsAvailable: false })} />);
        expect(screen.queryByRole('button', { name: 'GIF' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Emoji' })).toBeInTheDocument();
    });

    it('shows a counter near the limit', async () => {
        const user = userEvent.setup();
        render(<Chat {...props()} />);
        await user.click(screen.getByRole('textbox', { name: 'Message' }));
        await user.paste('x'.repeat(460));
        expect(screen.getByText('460/500')).toBeInTheDocument();
    });

    it('shows the donate prompt', async () => {
        const user = userEvent.setup();
        const p = props({ donate: true });
        render(<Chat {...p} />);
        expect(screen.getByRole('link', { name: 'Donate a slice' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(p.onDonateClose).toHaveBeenCalled();
    });
});
