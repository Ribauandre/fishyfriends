import { render, screen } from '@testing-library/react';
import App from './App';

function goTo(path) {
  window.history.pushState({}, '', path);
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

test('renders the Fishy Friends account entry point', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /sign in to your dock/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /enter the club/i })).toBeInTheDocument();
});

test('the root route redirects to /home, which redirects an unauthenticated visitor to /account', () => {
  goTo('/');
  render(<App />);
  expect(screen.getByRole('heading', { name: /sign in to your dock/i })).toBeInTheDocument();
});

describe('protected routes redirect an unauthenticated visitor to /account', () => {
  test.each(['/profile', '/fish-year', '/fluke-tournament', '/anglers'])('%s', (path) => {
    goTo(path);
    render(<App />);
    expect(screen.getByRole('heading', { name: /sign in to your dock/i })).toBeInTheDocument();
  });
});

test('the navbar is hidden entirely until a session exists', () => {
  goTo('/account');
  render(<App />);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
