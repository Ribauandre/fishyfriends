import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminBugReports from './AdminBugReports';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderAdmin(email = 'ribauandre@yahoo.com') {
  useAuth.mockReturnValue({
    user: { id: 'user-1', email },
    listBugReports: jest.fn().mockResolvedValue([
      { id: 'br-1', angler_name: 'Kevin', body: 'The like button does nothing.', page_url: '/fish-year', created_at: '2026-03-01T12:00:00Z' },
    ]),
  });
  return render(
    <MemoryRouter initialEntries={['/admin/bugs']}>
      <Routes>
        <Route path="/admin/bugs" element={<AdminBugReports />} />
        <Route path="/home" element={<div>Home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('lists submitted bug reports for the admin account', async () => {
  renderAdmin();
  expect(await screen.findByText('Kevin')).toBeInTheDocument();
  expect(screen.getByText('The like button does nothing.')).toBeInTheDocument();
  expect(screen.getByText('/fish-year')).toBeInTheDocument();
});

test('shows an empty state when there are no reports', async () => {
  useAuth.mockReturnValue({
    user: { id: 'user-1', email: 'ribauandre@yahoo.com' },
    listBugReports: jest.fn().mockResolvedValue([]),
  });
  render(
    <MemoryRouter initialEntries={['/admin/bugs']}>
      <Routes><Route path="/admin/bugs" element={<AdminBugReports />} /></Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText(/no bugs reported/i)).toBeInTheDocument();
});

test('redirects any non-admin account away from the page', async () => {
  renderAdmin('someone-else@example.com');
  await waitFor(() => expect(screen.getByText('Home page')).toBeInTheDocument());
});
