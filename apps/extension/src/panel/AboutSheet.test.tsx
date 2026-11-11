// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AboutSheet } from './AboutSheet';
import { DONATE_URL } from './donate';

describe('AboutSheet', () => {
    it('has About and Guide tabs like 1.2', async () => {
        const user = userEvent.setup();
        render(<AboutSheet open onClose={vi.fn()} version="2.0.0" />);
        expect(screen.getByText('Designed by Emanuel Caristi')).toBeInTheDocument();
        await user.click(screen.getByRole('tab', { name: 'Guide' }));
        expect(screen.getByText('🍕 Simple Steps')).toBeInTheDocument();
        expect(screen.getByText('💡 Quick Tips')).toBeInTheDocument();
    });

    it('offers a slice of pizza', async () => {
        const user = userEvent.setup();
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        render(<AboutSheet open onClose={vi.fn()} version="2.0.0" />);
        await user.click(screen.getByRole('button', { name: '🍕 Offer a Slice of Pizza' }));
        expect(open).toHaveBeenCalledWith(DONATE_URL, '_blank', 'noopener');
    });
});
