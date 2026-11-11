import { useState } from 'react';
import type { PanelRequest, PanelResponse, PublicSession, TimelineEntry } from '../lib/messages';
import { AboutSheet } from './AboutSheet';
import { Chat } from './Chat';
import { MenuSheet } from './MenuSheet';
import { PeopleSheet } from './PeopleSheet';
import { RoomHeader } from './RoomHeader';
import type { ActiveTab } from './activeTab';
import { statusLine, type StatusLine } from './statusLine';
import type { ThemePref } from './theme';
import { Button } from './ui/Button';

const TONE_DOT: Record<StatusLine['tone'], string> = {
    ok: 'bg-success',
    warn: 'bg-warning',
    muted: 'bg-muted',
    danger: 'bg-danger',
};

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
    donate: boolean;
    onDonateClose: () => void;
};

export function Room(props: RoomProps) {
    const { session, send } = props;
    const [sheet, setSheet] = useState<'menu' | 'people' | 'about' | null>(null);
    const room = session.room;
    if (!room) return null;
    const status = statusLine(session, props.activeTab);
    const nowPlaying = room.timeline?.title ?? (room.timeline ? 'Untitled video' : 'Nothing playing yet');
    const platform = room.timeline ? (room.timeline.platform === 'youtube' ? 'YouTube' : 'Netflix') : null;

    return (
        <main className="flex h-full flex-col bg-bg">
            <RoomHeader room={room} onPeople={() => setSheet('people')} onMenu={() => setSheet('menu')} />

            <div className="flex min-h-9 items-center gap-2 px-3">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[status.tone]}`} />
                <span className="flex-1 truncate text-body">{status.text}</span>
                {status.action && (
                    <Button size="sm" variant={status.tone === 'ok' ? 'secondary' : 'primary'} onClick={() => void send(status.action!.request)}>
                        {status.action.label}
                    </Button>
                )}
            </div>

            <div className="flex items-center gap-2 border-b border-line px-3 pb-2 text-meta text-muted">
                {platform && <span className="shrink-0">{platform}</span>}
                <span className="truncate">{nowPlaying}</span>
            </div>

            <Chat
                entries={props.entries}
                meUserId={session.me?.userId ?? null}
                soundsEnabled={props.soundsEnabled}
                onSend={(text) => void send({ type: 'chat.send', text })}
                serverUrl={session.serverUrl}
                gifsAvailable={props.gifsAvailable}
                donate={props.donate}
                onDonateClose={props.onDonateClose}
            />

            <MenuSheet
                open={sheet === 'menu'}
                onClose={() => setSheet(null)}
                session={session}
                send={send}
                extensionId={props.extensionId}
                themePref={props.themePref}
                onThemeChange={props.onThemeChange}
                soundsEnabled={props.soundsEnabled}
                onSoundsChange={props.onSoundsChange}
                onAbout={() => setSheet('about')}
            />
            <PeopleSheet open={sheet === 'people'} onClose={() => setSheet(null)} room={room} meUserId={session.me?.userId ?? null} />
            <AboutSheet open={sheet === 'about'} onClose={() => setSheet(null)} version={props.version} />
        </main>
    );
}
