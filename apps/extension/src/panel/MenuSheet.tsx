import { DONATE_URL } from './donate';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

export function MenuSheet(props: { open: boolean; onClose: () => void; serverUrl: string; onAbout: () => void }) {
    return (
        <Sheet open={props.open} onClose={props.onClose} title="More">
            <div className="flex flex-col gap-1">
                <Button size="sm" variant="ghost" align="start" onClick={props.onAbout}>About &amp; guide</Button>
                <Button size="sm" variant="ghost" align="start" onClick={() => window.open(DONATE_URL, '_blank', 'noopener')}>
                    🍕 Donate a slice
                </Button>
                <p className="px-3 pt-2 text-meta text-muted">Server: {props.serverUrl}</p>
            </div>
        </Sheet>
    );
}
