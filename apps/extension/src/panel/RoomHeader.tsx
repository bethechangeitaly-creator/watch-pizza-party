import { useState } from 'react';
import { LogOut, Minimize2, Monitor, Moon, MoreHorizontal, Sun, Volume2, VolumeX } from 'lucide-react';
import type { Room } from '@watch-party/shared';
import type { PublicSession } from '../lib/messages';
import type { ThemePref } from './theme';
import { Avatar } from './ui/Avatar';
import { IconButton } from './ui/IconButton';

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Night' };

function connection(status: PublicSession['status'], hasError: boolean): { label: string; dot: string } {
    if (status === 'joined') return { label: 'Connected', dot: 'bg-ok-fg' };
    if (hasError) return { label: 'Not connected', dot: 'bg-bad-fg' };
    return { label: 'Connecting', dot: 'bg-muted' };
}

export function RoomHeader(props: {
    room: Room;
    status: PublicSession['status'];
    hasError: boolean;
    themePref: ThemePref;
    onThemeChange: (p: ThemePref) => void;
    soundsEnabled: boolean;
    onSoundsChange: (on: boolean) => void;
    onMinimize: () => void;
    onLeave: () => void;
    onMenu: () => void;
}) {
    const { room } = props;
    const [copied, setCopied] = useState(false);
    const visible = room.participants.slice(0, 3);
    const extra = room.participants.length - visible.length;
    const conn = connection(props.status, props.hasError);
    const ThemeIcon = props.themePref === 'light' ? Sun : props.themePref === 'dark' ? Moon : Monitor;

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
        <header className="flex h-14 shrink-0 items-center gap-1.5 px-3">
            <img src="/icon32.png" alt="" className="h-7 w-7 rounded-control" />
            <button
                type="button"
                onClick={() => void copyCode()}
                aria-label={`Room code ${room.id}. Copy`}
                className="flex h-8 items-center gap-1.5 rounded-control bg-cheese px-2.5 text-meta font-bold text-cheese-fg"
            >
                {copied ? 'Copied!' : room.id}
                <span aria-label={conn.label} title={conn.label} className={`h-2 w-2 rounded-full ${conn.dot}`} />
            </button>
            <span className="flex -space-x-1.5 pl-1" aria-hidden="true">
                {visible.map((p) => (
                    <span key={p.id} className="rounded-full ring-2 ring-bg">
                        <Avatar name={p.username} color={p.avatarColor} />
                    </span>
                ))}
                {extra > 0 && <span className="pl-2 text-meta text-muted">+{extra}</span>}
            </span>
            <span className="flex-1" />
            <IconButton label="Minimize to bubble" onClick={props.onMinimize}><Minimize2 size={16} /></IconButton>
            <IconButton label={props.soundsEnabled ? 'Mute chat sounds' : 'Turn on chat sounds'} onClick={() => props.onSoundsChange(!props.soundsEnabled)}>
                {props.soundsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </IconButton>
            <IconButton label={`Theme: ${THEME_LABEL[props.themePref]}`} onClick={() => props.onThemeChange(NEXT_THEME[props.themePref])}>
                <ThemeIcon size={16} />
            </IconButton>
            <IconButton label="Leave party" onClick={props.onLeave}><LogOut size={16} /></IconButton>
            <IconButton label="Menu" onClick={props.onMenu}><MoreHorizontal size={18} /></IconButton>
        </header>
    );
}
