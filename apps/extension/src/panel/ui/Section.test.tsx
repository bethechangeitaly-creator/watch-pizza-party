// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Section } from './Section';

describe('Section', () => {
    it('shows its content only when open and reports toggles', async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        const { rerender } = render(<Section title="Invite friends" open={false} onToggle={onToggle}><p>inside</p></Section>);
        const header = screen.getByRole('button', { name: /Invite friends/ });
        expect(header).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('inside')).toBeNull();
        await user.click(header);
        expect(onToggle).toHaveBeenCalledTimes(1);
        rerender(<Section title="Invite friends" open onToggle={onToggle}><p>inside</p></Section>);
        expect(screen.getByRole('button', { name: /Invite friends/ })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('inside')).toBeInTheDocument();
    });

    it('shows a badge next to the title', () => {
        render(<Section title="People" badge="3" open={false} onToggle={vi.fn()}><p>x</p></Section>);
        expect(screen.getByRole('button', { name: /People.*3/ })).toBeInTheDocument();
    });
});
