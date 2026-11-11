import { useState } from 'react';
import { BookOpen, Heart } from 'lucide-react';
import { DONATE_URL } from './donate';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

const STEPS = ['Open Netflix or YouTube', 'Click the extension icon', 'Host or Join a party', 'Share the room code with friends'];

const TIPS = [
    'Use one browser tab at a time to avoid sync confusion',
    'Use the timeline to stay in sync',
    'Chat in real-time with your party',
    'Works best with stable internet',
    'Volume Boost: click the extension icon while you are on the video, then move the slider',
];

const donate = () => window.open(DONATE_URL, '_blank', 'noopener');
const card = 'rounded-card bg-surface-2 p-4';

export function AboutSheet({ open, onClose, version }: { open: boolean; onClose: () => void; version: string }) {
    const [tab, setTab] = useState<'about' | 'guide'>('about');
    const tabClass = (id: 'about' | 'guide') =>
        `flex h-9 flex-1 items-center justify-center gap-1.5 rounded-control text-body font-bold transition-colors ${
            tab === id ? 'bg-accent-strong text-accent-fg' : 'text-muted hover:text-text'
        }`;

    return (
        <Sheet open={open} onClose={onClose} title="Watch Pizza Party">
            <div className="flex flex-col gap-3 text-body">
                <div role="tablist" aria-label="About and guide" className="flex gap-1 rounded-card bg-surface-2 p-1">
                    <button type="button" role="tab" aria-selected={tab === 'about'} className={tabClass('about')} onClick={() => setTab('about')}>
                        <Heart size={15} /> About
                    </button>
                    <button type="button" role="tab" aria-selected={tab === 'guide'} className={tabClass('guide')} onClick={() => setTab('guide')}>
                        <BookOpen size={15} /> Guide
                    </button>
                </div>

                {tab === 'about' ? (
                    <div role="tabpanel" aria-label="About" className="flex flex-col gap-3">
                        <p className={`${card} leading-relaxed`}>
                            Built for people who enjoy a slice of pizza and a shared moment with friends, or with someone that matters, staying close even when far away.
                        </p>
                        <p className="text-center font-bold text-accent-strong dark:text-accent">Designed by Emanuel Caristi</p>
                        <Button variant="primary" className="h-11" onClick={donate}>🍕 Offer a Slice of Pizza</Button>
                        <p className="text-center text-meta text-muted">Version {version}</p>
                    </div>
                ) : (
                    <div role="tabpanel" aria-label="Guide" className="flex flex-col gap-3">
                        <section className={card}>
                            <h3 className="mb-3 text-center text-title font-bold">🍕 Simple Steps</h3>
                            <ol className="flex flex-col gap-2.5">
                                {STEPS.map((step, i) => (
                                    <li key={step} className="flex items-center gap-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-strong text-meta font-bold text-accent-fg">{i + 1}</span>
                                        <span>{step}</span>
                                    </li>
                                ))}
                                <li className="flex items-center gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cheese" aria-hidden="true">🍕</span>
                                    <span className="font-bold text-accent-strong dark:text-accent">Enjoy watching together!</span>
                                </li>
                            </ol>
                        </section>
                        <section className="flex flex-col items-center gap-2 rounded-card bg-bad p-4 text-center">
                            <h3 className="text-title font-bold text-bad-fg">Support Our Free Server</h3>
                            <p className="text-text">Keeping the Pizza Server online costs money. Your donation helps us keep it free for everyone!</p>
                            <Button variant="primary" className="w-full" onClick={donate}>🍕 Donate a Slice of Pizza</Button>
                        </section>
                        <section className={card}>
                            <h3 className="mb-2 font-bold">💡 Quick Tips</h3>
                            <ul className="flex flex-col gap-1.5 text-muted">
                                {TIPS.map((tip) => <li key={tip}>• {tip}</li>)}
                            </ul>
                        </section>
                    </div>
                )}
            </div>
        </Sheet>
    );
}
