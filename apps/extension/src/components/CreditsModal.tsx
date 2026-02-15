import React from 'react';
import { X, Heart } from 'lucide-react';

const DONATION_URL = 'https://www.paypal.com/donate/?hosted_button_id=BM6CSJULZ2RXG';

interface CreditsModalProps {
    open: boolean;
    onClose: () => void;
}

export function CreditsModal({ open, onClose }: CreditsModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0A0A] p-4 shadow-2xl">
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
                        title="Close credits"
                    >
                        <X size={13} />
                    </button>
                </div>

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
            </div>
        </div>
    );
}
