import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BiomeMap from './BiomeMap';

test('offers every fishing ground on the map, marks the current one, and prices the charter', () => {
  render(<BiomeMap biome="river" chartered={false} onSelect={jest.fn()} onShop={jest.fn()} />);
  expect(screen.getByRole('img', { name: /map of the fishing grounds/i })).toBeInTheDocument();
  ['Mountain Lake · Free', 'Swamp · Free', 'River · Free', 'Beach · Free', 'Bay · Free', 'Offshore · Charter · 50 pts'].forEach((name) => {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'River · Free' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Bay · Free' })).toHaveAttribute('aria-pressed', 'false');
});

test('shows the charter as paid for once you are out there', () => {
  render(<BiomeMap biome="offshore" chartered onSelect={jest.fn()} onShop={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Offshore · Chartered for this trip' })).toHaveAttribute('aria-pressed', 'true');
});

test('picking a ground and visiting the shop call back with the right thing', async () => {
  const onSelect = jest.fn(); const onShop = jest.fn();
  render(<BiomeMap biome="river" chartered={false} onSelect={onSelect} onShop={onShop} />);
  await userEvent.click(screen.getByRole('button', { name: 'Swamp · Free' }));
  expect(onSelect).toHaveBeenCalledWith('swamp');
  await userEvent.click(screen.getByRole('button', { name: 'Tackle shop' }));
  expect(onShop).toHaveBeenCalled();
});
