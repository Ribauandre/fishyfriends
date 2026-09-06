import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';

// Renders a component inside the same provider stack the real app uses (router + auth),
// so components that call useAuth()/useNavigate()/useSearchParams() work in tests without
// each test file re-wiring that boilerplate. Pass route to control the starting URL.
export default function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}
