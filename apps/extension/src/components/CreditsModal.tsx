import React, { useState } from 'react';
import { X, Heart, BookOpen } from 'lucide-react';

const DONATION_URL = 'https://www.paypal.com/donate/?hosted_button_id=BM6CSJULZ2RXG';

interface CreditsModalProps {
    open: boolean;
    onClose: () => void;
}

export function CreditsModal({ open, onClose }: CreditsModalProps) {
    const [tab, setTab] = useState<'about' | 'guide'>('about');

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0A0A] p-4 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-blue-600 shadow-lg shadow-blue-500/20">
                            <img src="/icon128.png" alt="Watch Pizza Party" className="h-full w-full object-cover" />
                        </div>
                        <h2 className="text-sm font-black tracking-wide text-white">Watch Pizza Party</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-white/10 p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
                        title="Close"
                    >
                        <X size={13} />
                    </button>
                </div>

                {/* Tab Selector */}
                <div className="mb-3 flex gap-2 rounded-xl bg-[#111] p-1">
                    <button
                        onClick={() => setTab('about')}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold transition-all ${
                            tab === 'about'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        <Heart size={12} />
                        About
                    </button>
                    <button
                        onClick={() => setTab('guide')}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold transition-all ${
                            tab === 'guide'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        <BookOpen size={12} />
                        Guide
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {tab === 'about' && (
                        <div className="space-y-3 text-[11px] text-gray-300">
                            <p className="rounded-xl border border-white/10 bg-white/5 p-3 leading-relaxed text-gray-200">
                                Built for people who enjoy a slice of pizza and a shared moment with friends, or with someone that matters,
                                staying close even when far away.
                            </p>
                            <p className="text-center text-[11px] font-bold tracking-wide text-blue-200">Designed by Emanuel Caristi</p>
                            <button
                                type="button"
                                onClick={() => window.open(DONATION_URL, '_blank', 'noopener,noreferrer')}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-blue-500"
                            >
                                <Heart size={13} />
                                Offer a Slice of Pizza
                            </button>
                        </div>
                    )}

                    {tab === 'guide' && (
                        <div className="space-y-3 text-[11px] text-gray-300">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <h3 className="mb-3 text-center text-[13px] font-black text-blue-300">🍕 Simple Steps</h3>
                                <ol className="space-y-3 text-[11px] leading-relaxed">
                                    <li className="flex gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-black text-white">1</span>
                                        <span>Open Netflix or YouTube</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-black text-white">2</span>
                                        <span>Click the extension icon</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-black text-white">3</span>
                                        <span>Host or Join a party</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-black text-white">4</span>
                                        <span>Share the room code with friends</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-[11px] font-black text-white">🍕</span>
                                        <span className="font-bold text-orange-300">Enjoy watching together!</span>
                                    </li>
                                </ol>
                            </div>

                            <div className="rounded-xl border-2 border-orange-500/40 bg-gradient-to-br from-orange-950/40 to-orange-900/20 p-4">
                                <div className="mb-3 text-center">
                                    <div className="mb-2 text-3xl">🍕</div>
                                    <h3 className="mb-1 text-[13px] font-black text-orange-300">Support Our Free Server</h3>
                                    <p className="text-[10px] leading-relaxed text-gray-300">
                                        Keeping the Pizza Server online costs money. Your donation helps us keep it free for everyone!
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => window.open(DONATION_URL, '_blank', 'noopener,noreferrer')}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-[12px] font-black uppercase tracking-wider text-white shadow-lg shadow-orange-500/30 transition-all hover:shadow-xl hover:shadow-orange-500/50 hover:scale-105"
                                >
                                    <Heart size={14} className="fill-current" />
                                    Donate a Slice of Pizza
                                </button>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <h3 className="mb-2 text-[11px] font-black text-blue-300">💡 Quick Tips</h3>
                                <ul className="space-y-1.5 text-[10px] leading-relaxed text-gray-400">
                                    <li>• Use the timeline to stay in sync</li>
                                    <li>• Chat in real-time with your party</li>
                                    <li>• Works best with stable internet</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
