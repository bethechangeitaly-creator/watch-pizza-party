// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

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
