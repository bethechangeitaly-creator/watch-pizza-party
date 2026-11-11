export function inviteText(roomId: string, extensionId: string): string {
    return [
        '🍕 Watch Pizza Party Invite',
        '',
        `Room Code: ${roomId}`,
        '',
        'Open the Watch Pizza Party extension and join with this code!',
        `Get the extension: https://chromewebstore.google.com/detail/${extensionId}`,
    ].join('\n');
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export const mailtoUrl = (text: string) =>
    `mailto:?subject=${encodeURIComponent('Watch Pizza Party Room Invite')}&body=${encodeURIComponent(text)}`;
