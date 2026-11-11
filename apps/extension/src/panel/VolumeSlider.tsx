import { useEffect, useState } from 'react';
import type { PanelRequest, PanelResponse, PublicSession } from '../lib/messages';
import { VOLUME_MAX, VOLUME_MIN, setBoost } from './volume';

/** Volume Boost slider, shared by the sidebar and the toolbar popup. */
export function VolumeSlider({
    session,
    send,
    showValue = false,
}: {
    session: PublicSession;
    send: (r: PanelRequest) => Promise<PanelResponse>;
    showValue?: boolean;
}) {
    const applied = Math.round(session.volumeGain * 100);
    const [percent, setPercent] = useState(applied);
    const [error, setError] = useState<string | null>(null);

    // Follow changes made elsewhere (popup ↔ sidebar).
    useEffect(() => setPercent(applied), [applied]);

    const commit = async (value: number) => {
        if (!session.mediaTab) return;
        const result = await setBoost(value, send);
        setError(result.ok ? null : result.message);
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
                <input
                    type="range"
                    aria-label="Volume Boost"
                    min={VOLUME_MIN}
                    max={VOLUME_MAX}
                    step={5}
                    value={percent}
                    disabled={!session.mediaTab}
                    onChange={(e) => setPercent(Number(e.target.value))}
                    onPointerUp={() => void commit(percent)}
                    onKeyUp={() => void commit(percent)}
                    onDoubleClick={() => {
                        setPercent(100);
                        void commit(100);
                    }}
                    className="min-w-0 flex-1 accent-accent"
                />
                {showValue && <span className="w-12 text-right text-body font-bold text-accent-strong dark:text-accent">{percent}%</span>}
            </div>
            <p className="text-meta text-muted">Double-click to reset to 100%. Local setting only.</p>
            {(error || !session.volumeReady) && (
                <p className="rounded-control bg-warn px-2.5 py-1.5 text-meta text-warn-fg">
                    {error ?? "Click the Watch Pizza Party icon in the toolbar while you're on the video to turn on Volume Boost."}
                </p>
            )}
            {!error && session.volumeReady && <p className="text-meta font-bold text-ok-fg">✓ Boost is ready.</p>}
        </div>
    );
}
