import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Send, Smile } from 'lucide-react';
import { LIMITS } from '@watch-party/shared';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { IconButton } from './ui/IconButton';

const COUNTER_FROM = 450;
const MAX_LINES = 4;
const LINE_PX = 18;

export function Composer({ onSend, serverUrl, gifsAvailable }: { onSend: (text: string) => void; serverUrl: string; gifsAvailable: boolean }) {
    const [text, setText] = useState('');
    const [picker, setPicker] = useState<'emoji' | 'gif' | null>(null);
    const ref = useRef<HTMLTextAreaElement>(null);

    // Grow with the text, up to 4 lines. Empty → one line (the placeholder must not size the box).
    const fit = () => {
        const el = ref.current;
        if (!el) return;
        el.style.height = '';
        if (!el.value) return;
        el.style.height = `${Math.min(el.scrollHeight, MAX_LINES * LINE_PX + 16)}px`;
    };
    useLayoutEffect(fit, [text]);
    useEffect(() => {
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, []);

    const submit = () => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onSend(trimmed.slice(0, LIMITS.chatMax));
        setText('');
        setPicker(null);
    };

    return (
        <div className="flex flex-col gap-2 border-t border-line p-3">
            {picker === 'emoji' && <EmojiPicker onPick={(emoji) => setText((t) => t + emoji)} />}
            {picker === 'gif' && (
                <GifPicker
                    serverUrl={serverUrl}
                    onPick={(url) => {
                        onSend(url);
                        setPicker(null);
                    }}
                />
            )}
            <div className="flex items-end gap-1">
                <IconButton label="Emoji" aria-pressed={picker === 'emoji'} onClick={() => setPicker((p) => (p === 'emoji' ? null : 'emoji'))}>
                    <Smile size={18} />
                </IconButton>
                {gifsAvailable && (
                    <IconButton label="GIF" aria-pressed={picker === 'gif'} onClick={() => setPicker((p) => (p === 'gif' ? null : 'gif'))}>
                        <ImageIcon size={18} />
                    </IconButton>
                )}
                <textarea
                    ref={ref}
                    aria-label="Message"
                    rows={1}
                    value={text}
                    maxLength={LIMITS.chatMax}
                    placeholder="Say something... (supports emoji and GIF)"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    className="h-9 min-h-9 flex-1 resize-none overflow-y-auto rounded-control bg-surface-2 px-3 py-2 text-body leading-[18px] text-text placeholder:truncate placeholder:text-muted/70"
                />
                <button
                    type="button"
                    aria-label="Send"
                    title="Send"
                    onClick={submit}
                    disabled={!text.trim()}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-strong text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                    <Send size={15} />
                </button>
            </div>
            {text.length >= COUNTER_FROM && (
                <p className="self-end text-meta text-muted">{text.length}/{LIMITS.chatMax}</p>
            )}
        </div>
    );
}
