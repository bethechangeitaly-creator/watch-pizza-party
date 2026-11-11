import { Sheet } from './ui/Sheet';

export function AboutSheet({ open, onClose, version }: { open: boolean; onClose: () => void; version: string }) {
    return (
        <Sheet open={open} onClose={onClose} title="About Watch Pizza Party">
            <div className="flex flex-col gap-4 text-body">
                <p>Watch YouTube and Netflix with friends, in sync, with a chat on the side.</p>
                <section className="flex flex-col gap-2">
                    <h3 className="text-meta text-muted">How it works</h3>
                    <ol className="flex list-decimal flex-col gap-1 pl-5">
                        <li>Open a video and start a party.</li>
                        <li>Share the room code with your friends.</li>
                        <li>Everyone stays in sync — the host controls playback.</li>
                    </ol>
                </section>
                <p className="text-meta text-muted">
                    Chat and room state live in server memory only and disappear when the room closes. GIF searches go through our server to Giphy.
                </p>
                <p className="text-meta text-muted">Version {version} · Made with love (and pizza) by Italy Be The Change.</p>
            </div>
        </Sheet>
    );
}
