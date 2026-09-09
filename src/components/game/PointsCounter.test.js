import React from 'react';
import { render, screen } from '@testing-library/react';
import PointsCounter from './PointsCounter';

test('always carries the true balance in its label and pops the change when it moves', () => {
  const { rerender } = render(<PointsCounter value={100} />);
  expect(screen.getByLabelText('100 tackle points')).toBeInTheDocument();
  expect(screen.getByText('100')).toBeInTheDocument();
  expect(screen.queryByText(/^[+-]\d+$/)).toBeNull();

  rerender(<PointsCounter value={163} />);
  expect(screen.getByLabelText('163 tackle points')).toBeInTheDocument();
  expect(screen.getByText('+63')).toHaveClass('is-gain');

  rerender(<PointsCounter value={113} />);
  expect(screen.getByLabelText('113 tackle points')).toBeInTheDocument();
  expect(screen.getByText('-50')).toHaveClass('is-loss');
});
