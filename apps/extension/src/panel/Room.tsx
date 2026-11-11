import { useState } from 'react';
import { Crown } from 'lucide-react';
import type { SyncRequestReason, UserStatus } from '@watch-party/shared';
import type { PanelRequest, PanelResponse, PublicSession, TimelineEntry } from '../lib/messages';
import { AboutSheet } from './AboutSheet';
import { Chat } from './Chat';
import { DONATE_URL } from './donate';
import { inviteText, mailtoUrl, whatsappUrl } from './invite';
import { MenuSheet } from './MenuSheet';
import { RoomHeader } from './RoomHeader';
import type { ActiveTab } from './activeTab';
import type { SectionId, SectionState } from './sections';
import { statusLine, type StatusLine } from './statusLine';
import type { ThemePref } from './theme';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Section } from './ui/Section';
import { VOLUME_MAX, VOLUME_MIN, setBoost } from './volume';

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
    const [sheet, setSheet] = useState<'menu' | 'about' | null>(null);
    const [confirm, setConfirm] = useState<'leave' | 'close' | null>(null);
    const [copied, setCopied] = useState(false);
    const [percent, setPercent] = useState(Math.round(session.volumeGain * 100));
    const [volumeError, setVolumeError] = useState<string | null>(null);
    const room = session.room;
    if (!room) return null;

    const me = session.me;
    const status = statusLine(session, props.activeTab);
    const nowPlaying = room.timeline?.title ?? (room.timeline ? 'Untitled video' : 'Nothing playing yet');
    const platform = room.timeline ? (room.timeline.platform === 'youtube' ? 'YouTube' : 'Netflix') : null;
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
    const commitVolume = async (value: number) => {
        if (!session.mediaTab) return;
        const result = await setBoost(value, send);
        setVolumeError(result.ok ? null : result.message);
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
                onLeave={() => setConfirm('leave')}
                onClose={() => setConfirm('close')}
                onMenu={() => setSheet('menu')}
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
                        <Button size="sm" variant="primary" onClick={() => void send(status.action!.request)}>{status.action.label}</Button>
                    )}
                </div>

                <p className="truncate px-1 text-meta text-muted">
                    {platform ? `▶ ${platform} · ` : ''}{nowPlaying}
                </p>

                <Section title="Invite to Join" open={sections.invite} onToggle={() => props.onToggleSection('invite')}>
                    <div className="grid grid-cols-3 gap-2">
                        <button type="button" aria-label="Copy invite text" className={`${pill} bg-invite text-invite-fg`} onClick={() => void copyInvite()}>
                            {copied ? 'Copied!' : 'Copy Invite'}
                        </button>
                        <button type="button" aria-label="Share via WhatsApp" className={`${pill} bg-wa text-wa-fg`} onClick={() => window.open(whatsappUrl(invite), '_blank', 'noopener')}>WhatsApp</button>
                        <button type="button" aria-label="Share via Email" className={`${pill} bg-mail text-mail-fg`} onClick={() => window.open(mailtoUrl(invite), '_blank', 'noopener')}>Email</button>
                    </div>
                    <p className="mt-2 text-meta text-muted">Or share the code <b className="text-text">{room.id}</b>.</p>
                </Section>

                <Section title="Actions" open={sections.sync} onToggle={() => props.onToggleSection('sync')}>
                    <button
                        type="button"
                        title={session.isHost ? 'Bring everyone to your position' : "Jump back to the host's position"}
                        className={`${pill} w-full bg-cheese text-cheese-fg`}
                        onClick={() => void send(session.isHost ? { type: 'sync.force' } : { type: 'sync.resyncMe' })}
                    >
                        🔄 Sync Now
                    </button>
                    {!session.isHost && (
                        <>
                            <p className="mb-1.5 mt-3 text-meta text-muted">Ask host:</p>
                            <div className="grid grid-cols-4 gap-1.5">
                                {ASKS.map((a) => (
                                    <button key={a.reason} type="button" aria-label={a.aria} title={a.aria}
                                        className={`${pill} bg-surface-2 text-meta text-text`} onClick={() => void send({ type: 'sync.request', reason: a.reason })}>
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </Section>

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

                <Section title="Volume Boost" badge={`${percent}%`} open={sections.volume} onToggle={() => props.onToggleSection('volume')}>
                    <input
                        type="range"
                        aria-label="Volume Boost"
                        min={VOLUME_MIN}
                        max={VOLUME_MAX}
                        step={10}
                        value={percent}
                        disabled={!session.mediaTab}
                        onChange={(e) => setPercent(Number(e.target.value))}
                        onPointerUp={() => void commitVolume(percent)}
                        onKeyUp={() => void commitVolume(percent)}
                        onDoubleClick={() => { setPercent(100); void commitVolume(100); }}
                        className="w-full accent-accent"
                    />
                    <p className="text-meta text-muted">Double-click to reset to 100%. Local setting only.</p>
                    {(volumeError || !session.volumeReady) && (
                        <p className="mt-1.5 rounded-control bg-warn px-2.5 py-1.5 text-meta text-warn-fg">
                            {volumeError ?? "Click the Watch Pizza Party icon in the toolbar while you're on the video to turn on Volume Boost."}
                        </p>
                    )}
                    {!volumeError && session.volumeReady && <p className="mt-1.5 text-meta font-bold text-ok-fg">✓ Boost is ready.</p>}
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
                    onSend={(text) => void send({ type: 'chat.send', text })}
                    serverUrl={session.serverUrl}
                    gifsAvailable={props.gifsAvailable}
                />
            </div>

            <MenuSheet open={sheet === 'menu'} onClose={() => setSheet(null)} serverUrl={session.serverUrl} onAbout={() => setSheet('about')} />
            <AboutSheet open={sheet === 'about'} onClose={() => setSheet(null)} version={props.version} />
        </main>
    );
}
