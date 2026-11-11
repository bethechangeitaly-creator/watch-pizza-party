import { useState } from 'react';
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
    { reason: 'back', label: '⏪ Back', aria: 'Ask the host to go back' },
    { reason: 'pause', label: '⏸ Pause', aria: 'Ask the host to pause' },
    { reason: 'play', label: '▶ Play', aria: 'Ask the host to play' },
    { reason: 'forward', label: '⏩ Forward', aria: 'Ask the host to go forward' },
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
};

export function Room(props: RoomProps) {
    const { session, send, sections } = props;
    const [sheet, setSheet] = useState<'menu' | 'about' | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);
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

    return (
        <main className="flex h-full flex-col bg-bg text-text">
            <RoomHeader
                room={room}
                status={session.status}
                hasError={Boolean(session.error)}
                themePref={props.themePref}
                onThemeChange={props.onThemeChange}
                soundsEnabled={props.soundsEnabled}
                onSoundsChange={props.onSoundsChange}
                onMinimize={() => void send({ type: 'panel.minimize' }).then(() => window.close())}
                onLeave={() => setConfirmLeave(true)}
                onMenu={() => setSheet('menu')}
            />

            {confirmLeave && (
                <div className="mx-3 mb-2 flex items-center gap-2 rounded-card bg-bad px-3 py-2 text-bad-fg">
                    <span className="flex-1 text-body font-semibold">Leave the party?</span>
                    <Button size="sm" variant="primary" onClick={() => void send({ type: 'session.leave' })}>Leave</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>Stay</Button>
                </div>
            )}

            <div role="region" aria-label="Party controls" className="flex max-h-[55%] shrink-0 flex-col gap-2 overflow-y-auto px-3 pb-2">
                {me && (
                    <div aria-label="You" className="flex items-center gap-2 rounded-card bg-surface px-3 py-2">
                        <Avatar name={me.username} color={me.avatarColor} size={32} />
                        <span className="flex-1 truncate text-body font-bold">{me.username}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-meta font-bold ${session.isHost ? 'bg-cheese text-cheese-fg' : 'bg-invite text-invite-fg'}`}>
                            {session.isHost ? 'Host' : 'Viewer'}
                        </span>
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

                <Section title="Invite friends" open={sections.invite} onToggle={() => props.onToggleSection('invite')}>
                    <div className="grid grid-cols-3 gap-2">
                        <button type="button" className={`${pill} bg-invite text-invite-fg`} onClick={() => void copyInvite()}>
                            {copied ? 'Copied!' : 'Copy invite'}
                        </button>
                        <button type="button" className={`${pill} bg-wa text-wa-fg`} onClick={() => window.open(whatsappUrl(invite), '_blank', 'noopener')}>WhatsApp</button>
                        <button type="button" className={`${pill} bg-mail text-mail-fg`} onClick={() => window.open(mailtoUrl(invite), '_blank', 'noopener')}>Email</button>
                    </div>
                    <p className="mt-2 text-meta text-muted">Or share the code <b className="text-text">{room.id}</b>.</p>
                </Section>

                <Section title="Sync" open={sections.sync} onToggle={() => props.onToggleSection('sync')}>
                    <div className="grid grid-cols-2 gap-2">
                        {session.isHost ? (
                            <button type="button" className={`${pill} bg-cheese text-cheese-fg`} onClick={() => void send({ type: 'sync.force' })}>🔄 Sync everyone</button>
                        ) : (
                            <button type="button" className={`${pill} bg-cheese text-cheese-fg`} onClick={() => void send({ type: 'sync.resyncMe' })}>🔄 Resync me</button>
                        )}
                        <button type="button" className={`${pill} bg-bad text-bad-fg`} onClick={donate}>🍕 Donate a slice</button>
                    </div>
                    {!session.isHost && (
                        <>
                            <p className="mb-1.5 mt-3 text-meta text-muted">Ask the host to:</p>
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

                <Section title="People" badge={String(room.participants.length)} open={sections.people} onToggle={() => props.onToggleSection('people')}>
                    <ul aria-label="People" className="flex flex-col gap-1">
                        {room.participants.map((p) => {
                            const isHost = p.id === room.hostId;
                            return (
                                <li key={p.id} className="flex items-center gap-2 py-1">
                                    <Avatar name={p.username} color={p.avatarColor} />
                                    <span className="truncate text-body font-semibold">{p.username}</span>
                                    {p.id === me?.userId && <span className="text-meta text-muted">You</span>}
                                    {isHost && <span className="rounded-full bg-cheese px-2 text-meta font-bold text-cheese-fg">Host</span>}
                                    <span className="ml-auto text-meta text-muted">{isHost ? '' : PERSON_STATUS[p.status]}</span>
                                </li>
                            );
                        })}
                    </ul>
                </Section>

                <Section title="Volume boost" badge={`${percent}%`} open={sections.volume} onToggle={() => props.onToggleSection('volume')}>
                    <input
                        type="range"
                        aria-label="Volume boost"
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
                    <p className="text-meta text-muted">{volumeError ?? 'Louder than the page allows. Double-click to reset.'}</p>
                </Section>
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
