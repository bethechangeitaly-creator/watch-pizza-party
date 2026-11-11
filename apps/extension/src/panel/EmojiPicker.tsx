const EMOJI = [
    '😀', '😂', '😍', '🥳', '🔥', '👏', '😅', '🤝', '🎬', '🍿', '🚀', '💯',
    '❤️', '🙌', '🤯', '😎', '🤩', '🥲', '🤖', '😈', '😴', '😡', '🤔', '🫶',
    '🫡', '🎉', '🕺', '💃', '💥', '✨', '🌈', '⚡', '🍕', '☕', '🍻', '🎮',
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
    return (
        <div role="group" aria-label="Emoji" className="grid grid-cols-9 gap-1 rounded-control bg-surface-2 p-2">
            {EMOJI.map((emoji) => (
                <button key={emoji} type="button" aria-label={emoji} onClick={() => onPick(emoji)} className="h-8 rounded-control text-title hover:bg-surface">
                    {emoji}
                </button>
            ))}
        </div>
    );
}
