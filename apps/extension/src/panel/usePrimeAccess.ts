import { useEffect, useState } from 'react';
import { hasPrimeAccess } from '../lib/primeAccess';

/** Whether the user has allowed Prime Video (kept up to date if they allow or remove it). */
export function usePrimeAccess(): boolean {
    const [allowed, setAllowed] = useState(false);
    useEffect(() => {
        let active = true;
        const refresh = () => void hasPrimeAccess().then((ok) => active && setAllowed(ok));
        refresh();
        // @types/chrome lacks removeListener on these events; the panel lives as long as the page anyway.
        chrome.permissions.onAdded.addListener(refresh);
        chrome.permissions.onRemoved.addListener(refresh);
        return () => {
            active = false;
        };
    }, []);
    return allowed;
}
