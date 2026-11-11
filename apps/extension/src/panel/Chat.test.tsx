// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TimelineEntry } from '../lib/messages';
import { Chat } from './Chat';
import { playTone } from './sounds';

vi.mock('./sounds', async (importOriginal) => ({ ...(await importOriginal<typeof import('./sounds')>()), playTone: vi.fn(), unlockAudio: vi.fn() }));

const msg = (userId: string, username: string, timestamp: number, text = 'hi'): TimelineEntry => ({
    kind: 'chat', message: { id: `${userId}-${timestamp}`, userId, username, avatarColor: '#3DD68C', text, timestamp },
});

function props(over: Partial<Parameters<typeof Chat>[0]> = {}) {
    return {
        entries: [] as TimelineEntry[], meUserId: 'u1', soundsEnabled: false, onSend: vi.fn(), serverUrl: 'https://s',
        gifsAvailable: true, isHost: false, ...over,
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

    it('draws my own messages in the accent bubble and others in a tint', () => {
        render(<Chat {...props({ entries: [msg('u1', 'Luca', 0, 'mine'), msg('u2', 'Marco', 1, 'theirs')] })} />);
        expect(screen.getByText('mine').closest('[data-bubble]')).toHaveClass('bg-accent-strong');
        expect(screen.getByText('theirs').closest('[data-bubble]')).not.toHaveClass('bg-accent-strong');
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

    it('chat rows never get squeezed when the list is long', () => {
        const entries: TimelineEntry[] = [
            { kind: 'system', event: { kind: 'play', text: 'Sky Anchovy pressed play', timestamp: 1 } },
            msg('u2', 'Marco', 2),
        ];
        render(<Chat {...props({ entries })} />);
        expect(screen.getByText('Sky Anchovy pressed play')).toHaveClass('shrink-0');
        expect(screen.getByText('hi').closest('article')).toHaveClass('shrink-0');
    });

    describe('sounds like 1.2', () => {
        const system = (text: string, timestamp: number): TimelineEntry => ({ kind: 'system', event: { kind: 'request', text, timestamp } });

        it('chimes for a new message from someone else — even the first one after opening', () => {
            vi.mocked(playTone).mockClear();
            const p = props({ soundsEnabled: true });
            const { rerender } = render(<Chat {...p} />);
            expect(playTone).not.toHaveBeenCalled();
            rerender(<Chat {...p} entries={[msg('u2', 'Marco', 1)]} />);
            expect(playTone).toHaveBeenCalledWith('receive');
        });

        it('never chimes for history loaded on open', () => {
            vi.mocked(playTone).mockClear();
            render(<Chat {...props({ soundsEnabled: true, entries: [msg('u2', 'Marco', 1)] })} />);
            expect(playTone).not.toHaveBeenCalled();
        });

        it('plays the send sound when you send', async () => {
            vi.mocked(playTone).mockClear();
            const user = userEvent.setup();
            render(<Chat {...props({ soundsEnabled: true })} />);
            await user.type(screen.getByRole('textbox', { name: 'Message' }), 'hi{Enter}');
            expect(playTone).toHaveBeenCalledWith('send');
        });

        it('the host hears what a viewer asks for', () => {
            vi.mocked(playTone).mockClear();
            const p = props({ soundsEnabled: true, isHost: true });
            const { rerender } = render(<Chat {...p} />);
            rerender(<Chat {...p} entries={[system('Marco asked the host to pause', 1)]} />);
            expect(playTone).toHaveBeenCalledWith('request-pause');
        });

        it('stays quiet when sounds are off', () => {
            vi.mocked(playTone).mockClear();
            const p = props({ soundsEnabled: false });
            const { rerender } = render(<Chat {...p} />);
            rerender(<Chat {...p} entries={[msg('u2', 'Marco', 1)]} />);
            expect(playTone).not.toHaveBeenCalled();
        });
    });
});
