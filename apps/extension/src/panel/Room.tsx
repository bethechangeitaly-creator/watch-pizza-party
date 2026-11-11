import { useState } from 'react';
import { Crown } from 'lucide-react';
import type { SyncRequestReason, UserStatus } from '@watch-party/shared';
import type { PanelRequest, PanelResponse, PublicSession, TimelineEntry } from '../lib/messages';
import { AboutSheet } from './AboutSheet';
import { Chat } from './Chat';
import { DONATE_URL } from './donate';
import { inviteText, mailtoUrl, whatsappUrl } from './invite';
import { nowPlaying } from './nowPlaying';
import { requestPrimeAccess } from '../lib/primeAccess';
import { RoomHeader } from './RoomHeader';
import type { ActiveTab } from './activeTab';
import type { SectionId, SectionState } from './sections';
import { statusLine, type StatusLine } from './statusLine';
import type { ThemePref } from './theme';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Section } from './ui/Section';
import { VolumeSlider } from './VolumeSlider';

const TONE: Record<StatusLine['tone'], string> = {
    ok: 'bg-ok text-ok-fg',
    warn: 'bg-warn text-warn-fg',
    danger: 'bg-bad text-bad-fg',
    muted: 'bg-surface-2 text-muted',
};

const PERSON_STATUS: Record<UserStatus, string> = {
    synced: 'In sync',
    drifting: 'Catching up',
    buffering: 'Buffering',
    ad: 'In an ad',
    paused: 'Paused',
    reconnecting: 'Reconnecting',
    unknown: '',
};

const ASKS: Array<{ reason: SyncRequestReason; label: string; aria: string }> = [
    { reason: 'back', label: '⏪ Back', aria: 'Ask host: go back' },
    { reason: 'pause', label: '⏸ Pause', aria: 'Ask host: pause' },
    { reason: 'play', label: '▶ Play', aria: 'Ask host: play' },
    { reason: 'forward', label: '⏩ Forward', aria: 'Ask host: go forward' },
];

const pill = 'flex h-9 items-center justify-center gap-1.5 rounded-control px-2 text-body font-bold transition-opacity hover:opacity-85';

export type RoomProps = {
    session: PublicSession;
    entries: TimelineEntry[];
    send: (r: PanelRequest) => Promise<PanelResponse>;
    activeTab: ActiveTab | null;
    extensionId: string;
    version: string;
    themePref: ThemePref;
    onThemeChange: (p: ThemePref) => void;
    soundsEnabled: boolean;
    onSoundsChange: (on: boolean) => void;
    gifsAvailable: boolean;
    sections: SectionState;
    onToggleSection: (id: SectionId) => void;
    donateDue: boolean;
    onDonateDismiss: () => void;
    primeAllowed: boolean;
};

function HostAvatar({ name, color, host, size }: { name: string; color: string; host: boolean; size?: 24 | 32 }) {
    return (
        <span className="relative shrink-0">
            <Avatar name={name} color={color} size={size} />
            {host && (
                <span title="Host" className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-cheese text-cheese-fg ring-2 ring-surface">
                    <Crown size={10} strokeWidth={2.5} />
                </span>
            )}
        </span>
    );
}

const CONNECTION: Record<string, { label: string; dot: string }> = {
    joined: { label: 'Connected', dot: 'bg-ok-fg' },
    reconnecting: { label: 'Reconnecting', dot: 'bg-warn-fg' },
};

export function Room(props: RoomProps) {
    const { session, send, sections } = props;
    const [aboutOpen, setAboutOpen] = useState(false);
    const [confirm, setConfirm] = useState<'leave' | 'close' | null>(null);
    const [copied, setCopied] = useState(false);
    const room = session.room;
    if (!room) return null;

    const me = session.me;
    const status = statusLine(session, props.activeTab, props.primeAllowed);
    const runStatusAction = (action: NonNullable<StatusLine['action']>) => {
        if (!action.needsPrime) return void send(action.request);
        // Asked straight from the click, as Chrome requires; then do what the button says.
        void requestPrimeAccess(props.activeTab?.url).then((ok) => {
            if (ok) void send(action.request);
        });
    };
    const playing = nowPlaying(session);
    const invite = inviteText(room.id, props.extensionId);

    const copyInvite = async () => {
        try {
            await navigator.clipboard.writeText(invite);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
        } catch {
            // Clipboard blocked.
        }
    };
    const donate = () => window.open(DONATE_URL, '_blank', 'noopener');
    const closeAll = async () => {
        await send({ type: 'volume.stop' });
        await send({ type: 'session.leave' });
        window.close();
    };
    const connection = CONNECTION[session.status] ?? { label: 'Not connected', dot: 'bg-bad-fg' };

    return (
        <main className="flex h-full flex-col bg-bg text-text">
            <RoomHeader
                room={room}
                themePref={props.themePref}
                onThemeChange={props.onThemeChange}
                soundsEnabled={props.soundsEnabled}
                onSoundsChange={props.onSoundsChange}
                onMinimize={() => void send({ type: 'panel.minimize' }).then(() => window.close())}
                onSyncNow={session.isHost ? () => void send({ type: 'sync.force' }) : undefined}
                onLeave={() => setConfirm('leave')}
                onClose={() => setConfirm('close')}
                onAbout={() => setAboutOpen(true)}
            />

            {confirm === 'leave' && (
                <div className="mx-3 mb-2 flex items-center gap-2 rounded-card bg-bad px-3 py-2 text-bad-fg">
                    <span className="flex-1 text-body font-semibold">Leave the party?</span>
                    <Button size="sm" variant="primary" onClick={() => void send({ type: 'session.leave' })}>Leave</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Stay</Button>
                </div>
            )}
            {confirm === 'close' && (
                <div role="alertdialog" aria-label="Close Extension?" className="mx-3 mb-2 flex flex-col gap-2 rounded-card bg-bad px-3 py-3 text-bad-fg">
                    <p className="text-title font-bold">Close Extension?</p>
                    <p className="text-body text-text">Are you sure you want to close the extension? This will leave the room and terminate the session.</p>
                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                        <Button size="sm" variant="primary" onClick={() => void closeAll()}>Close</Button>
                    </div>
                </div>
            )}

            <div role="region" aria-label="Party controls" className="flex max-h-[55%] shrink-0 flex-col gap-2 overflow-y-auto px-3 pb-2">
                {me && (
                    <div className="flex gap-2">
                        <div aria-label="You" className="flex min-w-0 flex-1 items-center gap-2 rounded-card bg-surface px-3 py-2">
                            <HostAvatar name={me.username} color={me.avatarColor} host={session.isHost} size={32} />
                            <span className="flex-1 truncate text-body font-bold">{me.username}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-meta font-bold ${session.isHost ? 'bg-cheese text-cheese-fg' : 'bg-invite text-invite-fg'}`}>
                                {session.isHost ? 'Host' : 'Viewer'}
                            </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 rounded-card bg-surface px-3 py-2">
                            <span className="text-meta font-bold text-muted">Server status</span>
                            <span aria-label={connection.label} title={connection.label} className={`h-2.5 w-2.5 rounded-full ${connection.dot}`} />
                        </div>
                    </div>
                )}

                <div className={`flex min-h-10 items-center gap-2 rounded-card px-3 py-1.5 ${TONE[status.tone]}`}>
                    <span aria-hidden="true">●</span>
                    <span className="flex-1 truncate text-body font-bold">{status.text}</span>
                    {status.action && (
                        <Button size="sm" variant="primary" onClick={() => runStatusAction(status.action!)}>{status.action.label}</Button>
                    )}
                </div>

                <section aria-label="Now Playing" className="flex items-center gap-3 rounded-card bg-surface px-3 py-2.5">
                    {playing.platform ? (
                        <span className={`shrink-0 rounded-control px-2 py-1 text-meta font-bold ${playing.platform === 'YouTube' ? 'bg-bad text-bad-fg' : playing.platform === 'Prime Video' ? 'bg-invite text-invite-fg' : 'bg-cheese text-cheese-fg'}`}>
                            ▶ {playing.platform}
                        </span>
                    ) : (
                        <span className="shrink-0 text-title" aria-hidden="true">🍿</span>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="text-meta text-muted">Now Playing</p>
                        <p className="line-clamp-2 text-body font-bold" title={playing.title ?? undefined}>
                            {playing.title ?? (playing.platform ? 'Untitled video' : 'Nothing playing yet')}
                        </p>
                    </div>
                </section>

                <Section title="Invite to Join" open={sections.invite} onToggle={() => props.onToggleSection('invite')}>
                    <div className="grid grid-cols-3 gap-2">
                        <button type="button" aria-label="Copy invite text" className={`${pill} bg-invite text-invite-fg`} onClick={() => void copyInvite()}>
                            {copied ? 'Copied!' : 'Copy Invite'}
                        </button>
                        <button type="button" aria-label="Share via WhatsApp" className={`${pill} bg-wa text-wa-fg`} onClick={() => window.open(whatsappUrl(invite), '_blank', 'noopener')}>WhatsApp</button>
                        <button type="button" aria-label="Share via Email" className={`${pill} bg-mail text-mail-fg`} onClick={() => window.open(mailtoUrl(invite), '_blank', 'noopener')}>Email</button>
                    </div>
                </Section>

                {!session.isHost && (
                    <Section title="Ask host:" open={sections.sync} onToggle={() => props.onToggleSection('sync')}>
                        <div className="grid grid-cols-4 gap-1.5">
                            {ASKS.map((a) => (
                                <button key={a.reason} type="button" aria-label={a.aria} title={a.aria}
                                    className={`${pill} bg-surface-2 text-meta text-text`} onClick={() => void send({ type: 'sync.request', reason: a.reason })}>
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    </Section>
                )}

                <Section title="Participants" badge={`${room.participants.length} Watching`} open={sections.people} onToggle={() => props.onToggleSection('people')}>
                    <ul aria-label="Participants" className="flex flex-col gap-1">
                        {room.participants.map((p) => {
                            const isHost = p.id === room.hostId;
                            return (
                                <li key={p.id} className="flex items-center gap-2 py-1">
                                    <HostAvatar name={p.username} color={p.avatarColor} host={isHost} />
                                    <span className="truncate text-body font-semibold">{p.username}</span>
                                    {p.id === me?.userId && <span className="text-meta text-muted">You</span>}
                                    {isHost && <span className="rounded-full bg-cheese px-2 text-meta font-bold text-cheese-fg">Host</span>}
                                    <span className="ml-auto text-meta text-muted">{isHost ? '' : PERSON_STATUS[p.status]}</span>
                                </li>
                            );
                        })}
                    </ul>
                </Section>

                <Section title="Volume Boost" badge={`${Math.round(session.volumeGain * 100)}%`} open={sections.volume} onToggle={() => props.onToggleSection('volume')}>
                    <VolumeSlider session={session} send={send} />
                </Section>

                {props.donateDue && (
                    <section className="flex flex-col gap-2 rounded-card bg-bad px-3 py-3 text-center">
                        <p className="text-body font-bold text-bad-fg">🍕 <span>Support Our Free Server</span></p>
                        <p className="text-meta text-text">Keeping the Pizza Server online costs money. Your donation helps us keep it free for everyone!</p>
                        <div className="flex gap-2">
                            <Button size="sm" variant="primary" className="flex-1" onClick={donate}>🍕 Donate a Slice of Pizza</Button>
                            <Button size="sm" variant="ghost" onClick={props.onDonateDismiss}>Not now</Button>
                        </div>
                    </section>
                )}
            </div>

            <div className="flex min-h-[40%] flex-1 flex-col border-t border-line">
                <Chat
                    entries={props.entries}
                    meUserId={me?.userId ?? null}
                    soundsEnabled={props.soundsEnabled}
                    isHost={session.isHost}
                    onSend={(text) => void send({ type: 'chat.send', text })}
                    serverUrl={session.serverUrl}
                    gifsAvailable={props.gifsAvailable}
                />
            </div>

            <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} version={props.version} />
        </main>
    );
}
