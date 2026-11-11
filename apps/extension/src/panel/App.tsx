import { useCallback, useEffect, useState } from 'react';
import { getActiveTab, type ActiveTab } from './activeTab';
import { AboutSheet } from './AboutSheet';
import { DONATE_KEY, DONATE_SNOOZE_MS, isDonateDue } from './donate';
import { fetchGifs } from './gifs';
import { Landing } from './Landing';
import { Room } from './Room';
import { SECTIONS_KEY, mergeSections, type SectionId, type SectionState } from './sections';
import { applyTheme, loadThemePref, saveThemePref, type ThemePref } from './theme';
import { useServerStatus } from './serverStatus';
import { useSession } from './useSession';

const SOUNDS_KEY = 'wpp.sounds';

export function App() {
    const { session, entries, send } = useSession();
    const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
    const [themePref, setThemePref] = useState<ThemePref>('dark');
    const [soundsEnabled, setSoundsEnabled] = useState(true);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [gifsAvailable, setGifsAvailable] = useState(false);
    const [storedSections, setStoredSections] = useState<unknown>(null);

    const refreshActiveTab = useCallback(() => {
        void getActiveTab().then(setActiveTab);
    }, []);

    useEffect(() => {
        applyTheme('dark');
        void loadThemePref().then((pref) => {
            setThemePref(pref);
            applyTheme(pref);
        });
        void chrome.storage.local.get(SOUNDS_KEY).then((stored) => setSoundsEnabled(stored[SOUNDS_KEY] !== false));

        refreshActiveTab();
        const onActivated = () => refreshActiveTab();
        const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo) => {
            if (change.url || change.title || change.status === 'complete') refreshActiveTab();
        };
        chrome.tabs.onActivated.addListener(onActivated);
        chrome.tabs.onUpdated.addListener(onUpdated);
        return () => {
            chrome.tabs.onActivated.removeListener(onActivated);
            chrome.tabs.onUpdated.removeListener(onUpdated);
        };
    }, [refreshActiveTab]);

    const serverUrl = session?.serverUrl;
    useEffect(() => {
        if (!serverUrl) return;
        void fetchGifs(serverUrl, '').then((result) => setGifsAvailable(result !== 'unavailable'));
    }, [serverUrl]);

    useEffect(() => {
        void chrome.storage.local.get(SECTIONS_KEY).then((stored) => setStoredSections(stored[SECTIONS_KEY] ?? null));
    }, []);
    const sections: SectionState = mergeSections(storedSections, session?.isHost ? 'host' : 'viewer');
    const toggleSection = (id: SectionId) => {
        const next = { ...sections, [id]: !sections[id] };
        setStoredSections(next);
        void chrome.storage.local.set({ [SECTIONS_KEY]: next });
    };

    // Like 1.2: the donation card shows when due; "Not now" hides it for 40 minutes. Checked every minute.
    const [donateNextAt, setDonateNextAt] = useState<number | null | undefined>(undefined);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        void chrome.storage.local.get(DONATE_KEY).then((stored) => {
            const value = stored[DONATE_KEY];
            setDonateNextAt(typeof value === 'number' ? value : null);
        });
        const timer = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(timer);
    }, []);
    const donateDue = donateNextAt !== undefined && isDonateDue(donateNextAt, now);
    const dismissDonate = () => {
        const next = Date.now() + DONATE_SNOOZE_MS;
        setDonateNextAt(next);
        void chrome.storage.local.set({ [DONATE_KEY]: next });
    };

    const server = useServerStatus(session?.serverUrl);

    const changeTheme = (pref: ThemePref) => {
        setThemePref(pref);
        applyTheme(pref);
        void saveThemePref(pref);
    };
    const changeSounds = (on: boolean) => {
        setSoundsEnabled(on);
        void chrome.storage.local.set({ [SOUNDS_KEY]: on });
    };

    const version = chrome.runtime.getManifest().version;
    const inRoom = !!session?.room && (session.status === 'joined' || session.status === 'reconnecting');

    if (inRoom && session) {
        return (
            <Room
                session={session}
                entries={entries}
                send={send}
                activeTab={activeTab}
                extensionId={chrome.runtime.id}
                version={version}
                themePref={themePref}
                onThemeChange={changeTheme}
                soundsEnabled={soundsEnabled}
                onSoundsChange={changeSounds}
                gifsAvailable={gifsAvailable}
                sections={sections}
                onToggleSection={toggleSection}
                donateDue={donateDue}
                onDonateDismiss={dismissDonate}
            />
        );
    }

    return (
        <>
            <Landing
                session={session}
                send={send}
                activeTab={activeTab}
                onAbout={() => setAboutOpen(true)}
                serverStatus={server.status}
                onRetryServer={server.retry}
            />
            <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} version={version} />
        </>
    );
}
