import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { BackgroundEvent, PublicSession } from '../lib/messages';
import { getActiveTab, type ActiveTab } from '../panel/activeTab';
import { applyTheme, loadThemePref } from '../panel/theme';
import { sendRequest } from '../panel/useSession';
import { Popup } from './Popup';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '../index.css';

applyTheme('system');
void loadThemePref().then(applyTheme);

// The popup never opens a 'wpp-panel' port: it must not count as an open panel.
function PopupRoot() {
    const [session, setSession] = useState<PublicSession | null>(null);
    const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
    const [windowId, setWindowId] = useState<number | null>(null);

    useEffect(() => {
        const onMessage = (message: BackgroundEvent) => {
            if (message?.type === 'bg.session') setSession(message.state);
        };
        chrome.runtime.onMessage.addListener(onMessage);
        void sendRequest({ type: 'session.get' }).then((r) => r.ok && setSession(r.state));
        void getActiveTab().then(setActiveTab);
        void chrome.windows.getCurrent().then((w) => setWindowId(w.id ?? null));
        return () => chrome.runtime.onMessage.removeListener(onMessage);
    }, []);

    // Called straight from the click so Chrome sees the user gesture.
    const openPanel = () => {
        if (windowId === null) return;
        void chrome.sidePanel.open({ windowId }).finally(() => window.close());
    };

    return <Popup session={session} send={sendRequest} openPanel={openPanel} activeTab={activeTab} extensionId={chrome.runtime.id} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <PopupRoot />
    </React.StrictMode>,
);
