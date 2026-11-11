import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Room } from '@watch-party/shared';
import { Avatar } from './ui/Avatar';
import { IconButton } from './ui/IconButton';

export function RoomHeader({ room, onPeople, onMenu }: { room: Room; onPeople: () => void; onMenu: () => void }) {
    const [copied, setCopied] = useState(false);
    const visible = room.participants.slice(0, 4);
    const extra = room.participants.length - visible.length;

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(room.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
        } catch {
            // Clipboard blocked — the code is visible on screen anyway.
        }
    };

    return (
        <header className="flex h-12 items-center gap-2 px-3">
            <button
                type="button"
                onClick={() => void copyCode()}
                aria-label={`Room code ${room.id}. Copy`}
                className="h-8 rounded-control bg-surface-2 px-3 font-mono text-meta text-text transition-colors hover:bg-surface-2/70"
            >
                {copied ? 'Copied' : room.id}
            </button>
            <span className="flex-1" />
            <button
                type="button"
                onClick={onPeople}
                aria-label={`${room.participants.length} watching. Show people`}
                className="flex h-8 items-center rounded-control px-1 hover:bg-surface-2"
            >
                <span className="flex -space-x-1.5">
                    {visible.map((p) => (
                        <span key={p.id} className="rounded-full ring-2 ring-bg">
                            <Avatar name={p.username} color={p.avatarColor} />
                        </span>
                    ))}
                </span>
                {extra > 0 && <span className="ml-1.5 text-meta text-muted">+{extra}</span>}
            </button>
            <IconButton label="Menu" onClick={onMenu}>
                <MoreHorizontal size={18} />
            </IconButton>
        </header>
    );
}
