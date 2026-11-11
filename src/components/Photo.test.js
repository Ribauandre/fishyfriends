import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Photo from './Photo';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const STORED = 'https://abc.supabase.co/storage/v1/object/public/fish-year-catches/user-1/bass.jpg';
const SIGNED = 'https://abc.supabase.co/storage/v1/object/sign/fish-year-catches/user-1/bass.jpg?token=one';
const SIGNED_AGAIN = 'https://abc.supabase.co/storage/v1/object/sign/fish-year-catches/user-1/bass.jpg?token=two';

function makeLinks(overrides = {}) {
  return {
    kind: jest.fn((value) => (value.includes('/storage/v1/object/public/') ? 'stored' : value.startsWith('https://elsewhere') ? 'foreign' : 'plain')),
    peek: jest.fn(() => null),
    resolve: jest.fn().mockResolvedValue(SIGNED),
    forget: jest.fn(),
    ...overrides,
  };
}

function renderPhoto(links, props = {}) {
  useAuth.mockReturnValue(links ? { photoLinks: links } : {});
  return render(<Photo src={STORED} alt="Kev's bass" className="catch" {...props} />);
}

test('a stored photo is requested through its signed link, never by its stored address', async () => {
  const links = makeLinks();
  renderPhoto(links);
  const image = screen.getByAltText("Kev's bass");
  expect(image).toHaveAttribute('data-photo', 'loading');
  expect(image.getAttribute('src')).toMatch(/^data:image\/gif/);
  await waitFor(() => expect(screen.getByAltText("Kev's bass")).toHaveAttribute('src', SIGNED));
  expect(screen.getByAltText("Kev's bass")).not.toHaveAttribute('data-photo');
  expect(screen.getByAltText("Kev's bass")).toHaveClass('catch');
  expect(links.resolve).toHaveBeenCalledWith(STORED);
});

test('a link already in hand is used at once, with nothing asked', () => {
  const links = makeLinks({ peek: jest.fn(() => SIGNED) });
  renderPhoto(links);
  expect(screen.getByAltText("Kev's bass")).toHaveAttribute('src', SIGNED);
  expect(links.resolve).not.toHaveBeenCalled();
});

test('a link that stops working is asked for again once, then the stored address, then the fallback', async () => {
  const links = makeLinks({ peek: jest.fn(() => SIGNED), resolve: jest.fn().mockResolvedValue(SIGNED_AGAIN) });
  renderPhoto(links, { fallback: <span>fish art</span> });
  fireEvent.error(screen.getByAltText("Kev's bass"));
  expect(links.forget).toHaveBeenCalledWith(STORED);
  await waitFor(() => expect(screen.getByAltText("Kev's bass")).toHaveAttribute('src', SIGNED_AGAIN));

  fireEvent.error(screen.getByAltText("Kev's bass"));
  expect(screen.getByAltText("Kev's bass")).toHaveAttribute('src', STORED);

  fireEvent.error(screen.getByAltText("Kev's bass"));
  expect(screen.queryByAltText("Kev's bass")).not.toBeInTheDocument();
  expect(screen.getByText('fish art')).toBeInTheDocument();
  expect(links.resolve).toHaveBeenCalledTimes(1);
});

test('when no link can be had it falls back to the stored address, which works while photos are open', async () => {
  const links = makeLinks({ resolve: jest.fn().mockResolvedValue(null) });
  renderPhoto(links);
  await waitFor(() => expect(screen.getByAltText("Kev's bass")).toHaveAttribute('src', STORED));
});

test('a stored photo that can\'t be shown at all leaves no broken image behind, fallback or not', async () => {
  const links = makeLinks({ resolve: jest.fn().mockResolvedValue(null) });
  const { container } = renderPhoto(links);
  await waitFor(() => expect(screen.getByAltText("Kev's bass")).toHaveAttribute('src', STORED));
  fireEvent.error(screen.getByAltText("Kev's bass"));
  expect(container.querySelector('img')).toBeNull();
});

test('an address somewhere else is never requested', () => {
  const links = makeLinks();
  const { container } = renderPhoto(links, { src: 'https://elsewhere.example/track.gif', fallback: <span>K</span> });
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('K')).toBeInTheDocument();
  expect(links.resolve).not.toHaveBeenCalled();
});

test('a preview of a file just chosen is shown as it is', () => {
  const links = makeLinks();
  renderPhoto(links, { src: 'blob:https://www.fishyfriends.club/1234' });
  expect(screen.getByAltText("Kev's bass")).toHaveAttribute('src', 'blob:https://www.fishyfriends.club/1234');
  expect(links.resolve).not.toHaveBeenCalled();
});

test('onLoad is the photo\'s, not the placeholder\'s', async () => {
  let release;
  const links = makeLinks({ resolve: jest.fn(() => new Promise((resolve) => { release = resolve; })) });
  const onLoad = jest.fn();
  renderPhoto(links, { onLoad });
  fireEvent.load(screen.getByAltText("Kev's bass"));
  expect(onLoad).not.toHaveBeenCalled();
  await act(async () => { release(SIGNED); });
  fireEvent.load(screen.getByAltText("Kev's bass"));
  expect(onLoad).toHaveBeenCalledTimes(1);
});

test('a different photo starts over rather than inheriting the last one\'s link', async () => {
  const other = 'https://abc.supabase.co/storage/v1/object/public/avatars/user-2/avatar.jpg';
  const links = makeLinks({ resolve: jest.fn((address) => Promise.resolve(address === STORED ? SIGNED : 'https://abc.supabase.co/storage/v1/object/sign/avatars/user-2/avatar.jpg?token=other')) });
  useAuth.mockReturnValue({ photoLinks: links });
  const { rerender } = render(<Photo src={STORED} alt="photo" />);
  await waitFor(() => expect(screen.getByAltText('photo')).toHaveAttribute('src', SIGNED));
  rerender(<Photo src={other} alt="photo" />);
  expect(screen.getByAltText('photo').getAttribute('src')).toMatch(/^data:image\/gif/);
  await waitFor(() => expect(screen.getByAltText('photo').getAttribute('src')).toContain('token=other'));
});

test('without the provider\'s links (a page test with a mocked useAuth) it is a plain image', () => {
  renderPhoto(null);
  expect(screen.getByAltText("Kev's bass")).toHaveAttribute('src', STORED);
});
