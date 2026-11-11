// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

// jsdom has no PointerEvent; a MouseEvent carries clientY, which is all the drag needs.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
    class FakePointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
        }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
}

function Harness() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>Open</button>
            <Sheet open={open} onClose={() => setOpen(false)} title="Menu">
                <button type="button">Inside</button>
            </Sheet>
        </>
    );
}

describe('Sheet', () => {
    it('slides down to close when the handle is dragged down', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Open' }));
        const handle = screen.getByTestId('sheet-handle');
        fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
        fireEvent.pointerMove(handle, { clientY: 260, pointerId: 1 });
        fireEvent.pointerUp(handle, { clientY: 260, pointerId: 1 });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('snaps back after a small drag', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Open' }));
        const handle = screen.getByTestId('sheet-handle');
        fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
        fireEvent.pointerMove(handle, { clientY: 120, pointerId: 1 });
        fireEvent.pointerUp(handle, { clientY: 120, pointerId: 1 });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has a close button', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Open' }));
        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes on Escape and restores focus', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Open' }));
        expect(screen.getByRole('dialog', { name: 'Menu' })).toBeVisible();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
    });

    it('closes on backdrop click', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Open' }));
        await user.click(screen.getByTestId('sheet-backdrop'));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('moves focus inside when opened', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Open' }));
        expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    });
});
