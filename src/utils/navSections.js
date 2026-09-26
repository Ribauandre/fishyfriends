// The app's pages, grouped into the five tabs of the nav. A section with more than one page
// shows sub-tabs at the top of those pages (SectionTabs), and its tab reopens whichever of its
// pages you were on last, so switching Compete → Plan → Compete lands back on Tournaments
// rather than always on Fish Year.
export const SECTIONS = [
  { key: 'home', label: 'Home', icon: 'home', pages: [{ to: '/home', label: 'Home' }] },
  { key: 'compete', label: 'Compete', icon: 'trophy', pages: [{ to: '/fish-year', label: 'Fish Year' }, { to: '/tournaments', label: 'Tournaments' }] },
  { key: 'crew', label: 'Crew', icon: 'crew', pages: [{ to: '/anglers', label: 'Anglers' }] },
  { key: 'plan', label: 'Plan', icon: 'map', pages: [{ to: '/trips', label: 'Trips' }, { to: '/waypoints', label: 'Waypoints' }] },
  { key: 'game', label: 'Game', icon: 'game', pages: [{ to: '/fishing-game', label: 'Cast & Catch' }] },
];

// The section page a path belongs to: /trips/abc is the Trips page of Plan.
export function pageFor(pathname) {
  for (const section of SECTIONS) {
    const page = section.pages.find((candidate) => pathname === candidate.to || pathname.startsWith(`${candidate.to}/`));
    if (page) return { section, page };
  }
  return null;
}

const lastPage = new Map();

export function rememberPage(pathname) {
  const match = pageFor(pathname);
  if (match) lastPage.set(match.section.key, match.page.to);
}

// Where a section's tab goes: the page of it you're on (so tapping the tab from a trip goes
// back up to Trips), else the one you were on last, else its first page.
export function destinationFor(section, pathname) {
  const current = pageFor(pathname);
  if (current?.section.key === section.key) return current.page.to;
  return lastPage.get(section.key) || section.pages[0].to;
}

export function resetNavMemory() {
  lastPage.clear();
}
