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
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <h3 className="mb-2 text-[12px] font-black text-blue-300">🍕 How to Use</h3>
                                <ol className="space-y-2 text-[10px] leading-relaxed">
                                    <li><span className="font-bold text-blue-200">1.</span> Open <span className="font-bold">Netflix</span> or <span className="font-bold">YouTube</span></li>
                                    <li><span className="font-bold text-blue-200">2.</span> Click the extension icon</li>
                                    <li><span className="font-bold text-blue-200">3.</span> Choose <span className="font-bold">"Host Party"</span> or <span className="font-bold">"Join Party"</span></li>
                                    <li><span className="font-bold text-blue-200">4.</span> Share the room code with friends!</li>
                                </ol>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <h3 className="mb-2 text-[12px] font-black text-blue-300">🌐 Server Options</h3>
                                <div className="space-y-2 text-[10px] leading-relaxed">
                                    <div>
                                        <p className="font-bold text-green-300">🍕 Pizza Server (Online)</p>
                                        <p className="text-gray-400">Free hosted server - works anywhere! Friends can join from different locations.</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-yellow-300">Local Server</p>
                                        <p className="text-gray-400">For developers running their own server locally. Others cannot connect remotely.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <h3 className="mb-2 text-[12px] font-black text-blue-300">💡 Tips</h3>
                                <ul className="space-y-1 text-[10px] leading-relaxed">
                                    <li>• Manual sync: Use the timeline to stay in sync</li>
                                    <li>• Chat with your party in real-time</li>
                                    <li>• Works best with stable internet</li>
                                    <li>• Pizza Server spins down after 15min of inactivity</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
