import { SECTIONS, pageFor, rememberPage, destinationFor, resetNavMemory } from './navSections';

const section = (key) => SECTIONS.find((candidate) => candidate.key === key);

beforeEach(() => resetNavMemory());

test('five tabs cover every page of the app', () => {
  expect(SECTIONS.map((candidate) => candidate.label)).toEqual(['Home', 'Compete', 'Crew', 'Plan', 'Game']);
  const pages = SECTIONS.flatMap((candidate) => candidate.pages.map((page) => page.to));
  expect(pages.sort()).toEqual(['/anglers', '/fish-year', '/fishing-game', '/home', '/tournaments', '/trips', '/waypoints'].sort());
});

test('a detail page belongs to the page above it', () => {
  expect(pageFor('/trips/abc')).toMatchObject({ section: { key: 'plan' }, page: { to: '/trips' } });
  expect(pageFor('/tournaments/t1')).toMatchObject({ section: { key: 'compete' }, page: { to: '/tournaments' } });
  expect(pageFor('/waypoints/m1')).toMatchObject({ section: { key: 'plan' }, page: { to: '/waypoints' } });
  expect(pageFor('/profile')).toBeNull();
  expect(pageFor('/tripsy')).toBeNull();
});

test('a tab opens the first page of its section until you have been somewhere else in it', () => {
  expect(destinationFor(section('plan'), '/home')).toBe('/trips');
  rememberPage('/waypoints/m1');
  expect(destinationFor(section('plan'), '/home')).toBe('/waypoints');
  rememberPage('/trips');
  expect(destinationFor(section('plan'), '/fish-year')).toBe('/trips');
});

test('tapping the tab you are in goes back up to that page', () => {
  rememberPage('/waypoints');
  expect(destinationFor(section('plan'), '/trips/abc')).toBe('/trips');
  expect(destinationFor(section('compete'), '/tournaments/t1')).toBe('/tournaments');
});
