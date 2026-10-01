import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageLightbox from './ImageLightbox';

test('the lightbox renders into the body, outside the card that opened it, and closes once', async () => {
  const onClose = jest.fn();
  const { container } = render(<div className="profile-card"><ImageLightbox src="https://example.com/bass.jpg" alt="A bass" label="Andre's photo" onClose={onClose} /></div>);
  const dialog = screen.getByRole('dialog', { name: "Andre's photo" });
  // Portalled: not a descendant of the card, so the card's stacking context can't trap it.
  expect(container.contains(dialog)).toBe(false);
  expect(dialog.parentElement).toBe(document.body);
  // Tapping the photo itself doesn't close it; the close button does, once.
  await userEvent.click(screen.getByAltText('A bass'));
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: /close expanded image/i }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
