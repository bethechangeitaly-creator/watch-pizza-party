import { useCallback, useEffect, useState } from 'react';
import { getActiveTab, type ActiveTab } from './activeTab';
import { AboutSheet } from './AboutSheet';
import { Landing } from './Landing';
import { Room } from './Room';
import { applyTheme, loadThemePref, saveThemePref, type ThemePref } from './theme';
import { useSession } from './useSession';

const SOUNDS_KEY = 'wpp.sounds';

export function App() {
    const { session, entries, send } = useSession();
    const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
    const [themePref, setThemePref] = useState<ThemePref>('system');
    const [soundsEnabled, setSoundsEnabled] = useState(true);
    const [aboutOpen, setAboutOpen] = useState(false);

    const refreshActiveTab = useCallback(() => {
        void getActiveTab().then(setActiveTab);
    }, []);

    useEffect(() => {
        applyTheme('system');
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
                activeTabId={activeTab?.tabId ?? null}
                extensionId={chrome.runtime.id}
                version={version}
                themePref={themePref}
                onThemeChange={changeTheme}
                soundsEnabled={soundsEnabled}
                onSoundsChange={changeSounds}
            />
        );
    }

    return (
        <>
            <Landing session={session} send={send} activeTab={activeTab} onAbout={() => setAboutOpen(true)} />
            <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} version={version} />
        </>
    );
}
