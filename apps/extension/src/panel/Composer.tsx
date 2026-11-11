import { useLayoutEffect, useRef, useState } from 'react';
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

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_LINES * LINE_PX + 16)}px`;
    }, [text]);

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
                    placeholder="Message"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    className="min-h-8 flex-1 resize-none rounded-control bg-surface-2 px-3 py-[7px] text-body text-text placeholder:text-muted/70"
                />
                <IconButton label="Send" onClick={submit} disabled={!text.trim()}>
                    <Send size={16} />
                </IconButton>
            </div>
            {text.length >= COUNTER_FROM && (
                <p className="self-end text-meta text-muted">{text.length}/{LIMITS.chatMax}</p>
            )}
        </div>
    );
}
