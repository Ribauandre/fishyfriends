import React from 'react';
import { render, screen } from '@testing-library/react';
import BugReportsSection from './AdminBugReports';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

test('lists the bug reports the database hands back', async () => {
  useAuth.mockReturnValue({
    listBugReports: jest.fn().mockResolvedValue([
      { id: 'br-1', angler_name: 'Kevin', body: 'The like button does nothing.', page_url: '/fish-year', created_at: '2026-03-01T12:00:00Z' },
    ]),
  });
  render(<BugReportsSection />);
  expect(await screen.findByText('Kevin')).toBeInTheDocument();
  expect(screen.getByText('The like button does nothing.')).toBeInTheDocument();
  expect(screen.getByText('/fish-year')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '1 report' })).toBeInTheDocument();
});

test('shows an empty state when there are no reports', async () => {
  useAuth.mockReturnValue({ listBugReports: jest.fn().mockResolvedValue([]) });
  render(<BugReportsSection />);
  expect(await screen.findByText(/no bugs reported/i)).toBeInTheDocument();
});
