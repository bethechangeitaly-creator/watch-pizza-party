import type { Room, UserStatus } from '@watch-party/shared';
import { Avatar } from './ui/Avatar';
import { Sheet } from './ui/Sheet';

const STATUS_TEXT: Record<UserStatus, string> = {
    synced: 'In sync',
    drifting: 'Catching up',
    buffering: 'Buffering',
    ad: 'In an ad',
    paused: 'Paused',
    reconnecting: 'Reconnecting',
    unknown: '—',
};

export function PeopleSheet({ open, onClose, room, meUserId }: { open: boolean; onClose: () => void; room: Room; meUserId: string | null }) {
    return (
        <Sheet open={open} onClose={onClose} title="People">
            <ul className="flex flex-col gap-1">
                {room.participants.map((p) => {
                    const isHost = p.id === room.hostId;
                    return (
                        <li key={p.id} className="flex items-center gap-3 rounded-control px-2 py-2">
                            <Avatar name={p.username} color={p.avatarColor} size={32} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-body font-medium">{p.username}</span>
                                    {p.id === meUserId && <span className="text-meta text-muted">You</span>}
                                    {isHost && <span className="rounded-full bg-accent/15 px-2 text-meta text-accent">Host</span>}
                                </div>
                                <span className="text-meta text-muted">{isHost ? 'Controls playback' : STATUS_TEXT[p.status]}</span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </Sheet>
    );
}
