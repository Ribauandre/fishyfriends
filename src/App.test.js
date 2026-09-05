import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Fishy Friends account entry point', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /sign in to your dock/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /enter the club/i })).toBeInTheDocument();
});
