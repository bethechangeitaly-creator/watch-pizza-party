import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { PanelRequest, PanelResponse, PublicSession } from '../lib/messages';
import type { ActiveTab } from '../panel/activeTab';
import { inviteText } from '../panel/invite';
import { Avatar } from '../panel/ui/Avatar';
import { Button } from '../panel/ui/Button';
import { IconButton } from '../panel/ui/IconButton';

export function Popup(props: {
    session: PublicSession | null;
    send: (r: PanelRequest) => Promise<PanelResponse>;
    openPanel: () => void;
    activeTab: ActiveTab | null;
    extensionId: string;
}) {
    const { session, send } = props;
    const [copied, setCopied] = useState(false);
    const room = session?.room ?? null;
    const mediaTabId = session?.mediaTab?.tabId;
    const activeTabId = props.activeTab?.tabId;

    // Opening the popup on the video tab is when Chrome lets us capture its audio.
    useEffect(() => {
        if (room && mediaTabId !== undefined && mediaTabId === activeTabId) void send({ type: 'volume.arm', tabId: mediaTabId });
    }, [Boolean(room), mediaTabId, activeTabId, send]);

    const header = (
        <header className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-card bg-cheese">
                <img src="/icon128.png" alt="" className="h-8 w-8" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-title font-bold">Watch Pizza Party</p>
                <p className="text-meta text-muted">Sync &amp; Watch Together</p>
            </div>
        </header>
    );

    if (!room || !session?.me) {
        return (
            <main className="flex w-[300px] flex-col gap-4 bg-bg p-4 text-text">
                {header}
                <p className="rounded-card bg-surface px-3 py-2 text-body text-muted">Open the sidebar to create or join a room</p>
                <Button variant="primary" className="h-11" onClick={props.openPanel}>Open Full Sidebar</Button>
            </main>
        );
    }

    const connected = session.status === 'joined';
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(inviteText(room.id, props.extensionId));
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
        } catch {
            // Clipboard blocked.
        }
    };
    const count = room.participants.length;

    return (
        <main className="flex w-[300px] flex-col gap-3 bg-bg p-4 text-text">
            {header}
            <dl className="flex flex-col divide-y divide-line rounded-card bg-surface px-3 shadow-[0_1px_3px_rgb(120_60_20/0.08)] dark:shadow-none">
                <div className="flex items-center gap-2 py-2">
                    <dt className="w-16 text-meta text-muted">You</dt>
                    <dd className="flex min-w-0 flex-1 items-center gap-2">
                        <Avatar name={session.me.username} color={session.me.avatarColor} />
                        <span className="truncate text-body font-bold">{session.me.username}</span>
                        <span className={`ml-auto rounded-full px-2 text-meta font-bold ${session.isHost ? 'bg-cheese text-cheese-fg' : 'bg-invite text-invite-fg'}`}>
                            {session.isHost ? 'Host' : 'Viewer'}
                        </span>
                    </dd>
                </div>
                <div className="flex items-center gap-2 py-2">
                    <dt className="w-16 text-meta text-muted">Room</dt>
                    <dd className="flex flex-1 items-center gap-2">
                        <span className="rounded-control bg-cheese px-2 py-0.5 text-meta font-bold text-cheese-fg">{room.id}</span>
                        <span
                            aria-label={connected ? 'Connected' : 'Not connected'}
                            title={connected ? 'Connected' : 'Not connected'}
                            className={`h-2 w-2 rounded-full ${connected ? 'bg-ok-fg' : 'bg-muted'}`}
                        />
                        <IconButton label="Copy invite text" className="ml-auto" onClick={() => void copy()}>
                            {copied ? <Check size={15} /> : <Copy size={15} />}
                        </IconButton>
                    </dd>
                </div>
                <div className="flex items-center gap-2 py-2">
                    <dt className="w-16 text-meta text-muted">Watching</dt>
                    <dd className="text-body font-semibold">{count === 1 ? '1 person' : `${count} people`}</dd>
                </div>
            </dl>
            <Button variant="primary" className="h-11" onClick={props.openPanel}>Open Full Sidebar</Button>
        </main>
    );
}
