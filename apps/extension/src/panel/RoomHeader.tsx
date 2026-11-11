import { useState } from 'react';
import { Check, Copy, LogOut, Minimize2, Moon, Power, Sun, Volume2, VolumeX } from 'lucide-react';
import type { Room } from '@watch-party/shared';
import type { ThemePref } from './theme';
import { IconButton } from './ui/IconButton';

export function RoomHeader(props: {
    room: Room;
    themePref: ThemePref;
    onThemeChange: (p: ThemePref) => void;
    soundsEnabled: boolean;
    onSoundsChange: (on: boolean) => void;
    onMinimize: () => void;
    onLeave: () => void;
    onClose: () => void;
    onMenu: () => void;
}) {
    const { room } = props;
    const [copied, setCopied] = useState(false);
    const night = props.themePref === 'dark';

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(room.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
        } catch {
            // Clipboard blocked — the code is visible anyway.
        }
    };

    return (
        <header className="flex h-14 shrink-0 items-center gap-0.5 px-3">
            <button type="button" aria-label="Menu" title="About, guide and server" onClick={props.onMenu} className="shrink-0 rounded-control">
                <img src="/icon32.png" alt="" className="h-7 w-7 rounded-control" />
            </button>
            <span className="ml-1 shrink-0 text-meta font-bold">
                <span className="text-muted">Room: </span>{room.id}
            </span>
            <IconButton label="Copy room code" onClick={() => void copyCode()}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
            </IconButton>
            <span className="flex-1" />
            <IconButton label="Minimize sidebar" onClick={props.onMinimize}><Minimize2 size={16} /></IconButton>
            <IconButton label={props.soundsEnabled ? 'Mute chat sounds' : 'Enable chat sounds'} onClick={() => props.onSoundsChange(!props.soundsEnabled)}>
                {props.soundsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </IconButton>
            <IconButton
                label={night ? 'Switch to light mode (work / YouTube)' : 'Switch to dark mode (cinema / Netflix)'}
                onClick={() => props.onThemeChange(night ? 'light' : 'dark')}
            >
                {night ? <Sun size={16} /> : <Moon size={16} />}
            </IconButton>
            <IconButton label="Leave room" onClick={props.onLeave}><LogOut size={16} /></IconButton>
            <button
                type="button"
                aria-label="Close extension"
                title="Close extension"
                onClick={props.onClose}
                className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-strong text-accent-fg transition-opacity hover:opacity-90"
            >
                <Power size={17} strokeWidth={2.5} />
            </button>
        </header>
    );
}
