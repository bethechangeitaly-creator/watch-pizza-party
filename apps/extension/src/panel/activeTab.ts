export type ActiveTab = { tabId: number; url?: string; title?: string };

export async function getActiveTab(): Promise<ActiveTab | null> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return null;
    return { tabId: tab.id, url: tab.url, title: tab.title };
}
