import { useState, type ReactNode } from 'react';
import type { SyncRequestReason } from '@watch-party/shared';
import type { PanelRequest, PanelResponse, PublicSession } from '../lib/messages';
import { DONATE_URL } from './donate';
import { inviteText, mailtoUrl, whatsappUrl } from './invite';
import type { ThemePref } from './theme';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';
import { VOLUME_MAX, VOLUME_MIN, getTabStreamId, startOrUpdateBoost } from './volume';

const ASKS: Array<{ reason: SyncRequestReason; label: string }> = [
    { reason: 'pause', label: 'Pause' },
    { reason: 'play', label: 'Play' },
    { reason: 'back', label: 'Back' },
    { reason: 'forward', label: 'Forward' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 first:pt-0">
            <h3 className="text-meta text-muted">{title}</h3>
            {children}
        </section>
    );
}

export function MenuSheet(props: {
    open: boolean;
    onClose: () => void;
    session: PublicSession;
    send: (r: PanelRequest) => Promise<PanelResponse>;
    extensionId: string;
    themePref: ThemePref;
    onThemeChange: (p: ThemePref) => void;
    soundsEnabled: boolean;
    onSoundsChange: (on: boolean) => void;
    onAbout: () => void;
}) {
    const { session, send } = props;
    const [percent, setPercent] = useState(Math.round(session.volumeGain * 100));
    const [volumeError, setVolumeError] = useState<string | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [copied, setCopied] = useState<'code' | 'invite' | null>(null);
    const roomId = session.roomId ?? '';
    const invite = inviteText(roomId, props.extensionId);

    const copy = async (what: 'code' | 'invite') => {
        try {
            await navigator.clipboard.writeText(what === 'code' ? roomId : invite);
            setCopied(what);
            setTimeout(() => setCopied(null), 1400);
        } catch {
            // Clipboard blocked.
        }
    };

    const commitVolume = async () => {
        const tabId = session.mediaTab?.tabId;
        if (tabId === undefined) return;
        const result = await startOrUpdateBoost({
            percent,
            mediaTabId: tabId,
            capturing: session.volumeGain > 1,
            send,
            getStreamId: getTabStreamId,
        });
        setVolumeError(result.ok ? null : result.message);
    };

    return (
        <Sheet open={props.open} onClose={props.onClose} title="Menu">
            <Section title="Invite">
                <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" onClick={() => void copy('code')}>{copied === 'code' ? 'Copied' : 'Copy code'}</Button>
                    <Button size="sm" onClick={() => void copy('invite')}>{copied === 'invite' ? 'Copied' : 'Copy invite'}</Button>
                    <Button size="sm" onClick={() => window.open(whatsappUrl(invite), '_blank', 'noopener')}>WhatsApp</Button>
                    <Button size="sm" onClick={() => window.open(mailtoUrl(invite), '_blank', 'noopener')}>Email</Button>
                </div>
            </Section>

            <Section title="Sync">
                {session.isHost ? (
                    <Button size="sm" onClick={() => void send({ type: 'sync.force' })}>Sync everyone now</Button>
                ) : (
                    <>
                        <Button size="sm" onClick={() => void send({ type: 'sync.resyncMe' })}>Resync me</Button>
                        <p className="text-meta text-muted">Ask the host to:</p>
                        <div className="grid grid-cols-4 gap-2">
                            {ASKS.map(({ reason, label }) => (
                                <Button key={reason} size="sm" variant="ghost" onClick={() => void send({ type: 'sync.request', reason })}>
                                    {label}
                                </Button>
                            ))}
                        </div>
                    </>
                )}
            </Section>

            <Section title="Volume boost">
                <div className="flex items-center justify-between text-body">
                    <span>{percent === 100 ? 'Off' : 'Louder than the page allows'}</span>
                    <span className="font-medium">{percent}%</span>
                </div>
                <input
                    type="range"
                    aria-label="Volume boost"
                    min={VOLUME_MIN}
                    max={VOLUME_MAX}
                    step={10}
                    value={percent}
                    disabled={!session.mediaTab}
                    onChange={(e) => setPercent(Number(e.target.value))}
                    onPointerUp={() => void commitVolume()}
                    onKeyUp={() => void commitVolume()}
                    className="w-full accent-accent"
                />
                {volumeError && <p className="text-meta text-danger">{volumeError}</p>}
            </Section>

            <Section title="Appearance">
                <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-control bg-surface-2 p-1">
                    {(['system', 'light', 'dark'] as const).map((pref) => (
                        <button
                            key={pref}
                            type="button"
                            aria-pressed={props.themePref === pref}
                            onClick={() => props.onThemeChange(pref)}
                            className={`h-[30px] rounded-control text-meta font-medium capitalize ${
                                props.themePref === pref ? 'bg-surface text-text' : 'text-muted hover:text-text'
                            }`}
                        >
                            {pref}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={props.soundsEnabled}
                    onClick={() => props.onSoundsChange(!props.soundsEnabled)}
                    className="flex h-9 items-center justify-between text-body"
                >
                    Chat sounds
                    <span className={`relative h-5 w-9 rounded-full transition-colors ${props.soundsEnabled ? 'bg-accent' : 'bg-surface-2'}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${props.soundsEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </span>
                </button>
            </Section>

            <Section title="More">
                <div className="flex flex-col items-stretch gap-1">
                    <Button size="sm" variant="ghost" align="start" onClick={() => window.open(DONATE_URL, '_blank', 'noopener')}>
                        Support Watch Pizza Party
                    </Button>
                    <Button size="sm" variant="ghost" align="start" onClick={props.onAbout}>About & guide</Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        align="start"
                        onClick={() => void send({ type: 'panel.minimize' }).then(() => window.close())}
                    >
                        Minimize to bubble
                    </Button>
                    {confirmLeave ? (
                        <div className="flex items-center gap-2 rounded-control bg-surface-2 p-2">
                            <span className="flex-1 text-body">Leave the party?</span>
                            <Button size="sm" variant="danger" onClick={() => void send({ type: 'session.leave' })}>Leave</Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>Stay</Button>
                        </div>
                    ) : (
                        <Button size="sm" variant="danger" align="start" onClick={() => setConfirmLeave(true)}>
                            Leave party
                        </Button>
                    )}
                </div>
            </Section>
        </Sheet>
    );
}
