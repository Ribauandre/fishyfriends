import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Each step points at a real element via its data-tour attribute, and most steps carry a
// route: the tour navigates there first so the spotlight lands on the actual feature instead
// of a nav link pointing at it from the wrong page. A step whose target still isn't found
// (e.g. it hasn't finished loading) shows anyway — centred, with no spotlight — so the
// walkthrough always covers every feature.
const STEPS = [
  {
    target: null,
    eyebrow: 'Welcome aboard',
    title: 'Here\'s the quick tour.',
    body: 'Sixty seconds on what this place does, then you can get back to lying about fish sizes.',
  },
  {
    target: '[data-tour="fish-year-card"]',
    route: '/fish-year',
    eyebrow: 'The main event',
    title: 'Fish Year',
    body: 'At least one fish a month, every month. This board tracks how many of the twelve you\'ve actually landed.',
  },
  {
    target: '[data-tour="log-catch-button"]',
    eyebrow: 'Log a catch',
    title: 'Post your proof',
    body: 'One button, on every page. Add a photo and the species, then tick where it counts: Fish Year, a personal best, a tournament or a trip. We read the date off the photo, so no backdating.',
  },
  {
    target: '[data-tour="anglers-intro"]',
    route: '/anglers',
    eyebrow: 'The crew',
    title: 'Everyone\'s personal bests',
    body: 'Tap an angler to open their biggest fish by species, then go beat one.',
  },
  {
    target: '[data-tour="tournament-highlight"]',
    route: '/tournaments',
    eyebrow: 'Bragging rights',
    title: 'Tournaments',
    body: 'Start your own — name it, set the rules and dates — and the crew logs entries against a real leaderboard.',
  },
  {
    target: '[data-tour="waypoints-intro"]',
    route: '/waypoints',
    eyebrow: 'Kept quiet',
    title: 'Waypoints',
    body: 'Import your GPX pins from Navionics or C-MAP and invite only the crew you actually want reading them — nobody else sees a map until they\'re invited.',
  },
  {
    target: '[data-tour="notification-bell"]',
    eyebrow: 'Stay in the loop',
    title: 'Likes and comments',
    body: 'When someone likes or comments on your catch, it shows up here. Tap a notification to jump straight to the post.',
  },
  {
    target: '[data-tour="profile-card"]',
    route: '/profile',
    eyebrow: 'Last stop',
    title: 'Your profile',
    body: 'Your photo and home water, your personal bests and species checklist, your fishing licenses, and how the crew pays you back after a trip.',
  },
];

const PADDING = 8;
const MARGIN = 12;
const GAP = 14;

// The safe-area insets (status bar and Dynamic Island, home indicator, the island's side in
// landscape) as the page sees them — 0 in a browser tab, real in the installed app, which is
// viewport-fit=cover. CSS knows them only as env(), so a hidden probe reads them back.
function safeInsets() {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const read = (value) => parseFloat(value) || 0;
  const insets = { top: read(style.paddingTop), right: read(style.paddingRight), bottom: read(style.paddingBottom), left: read(style.paddingLeft) };
  probe.remove();
  return insets;
}

// Where the card goes beside the spotlight: below it if it fits, else above, and always clamped
// fully on screen inside the safe area, so its button never lands under the home indicator or
// its text under the island in landscape. Pure, for the tests.
export function placeCard(spotlight, card, view, insets = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const minLeft = MARGIN + insets.left;
  const maxLeft = Math.max(minLeft, view.width - insets.right - card.width - MARGIN);
  const left = Math.min(Math.max(minLeft, spotlight.left), maxLeft);
  const minTop = MARGIN + insets.top;
  const maxTop = Math.max(minTop, view.height - insets.bottom - card.height - MARGIN);
  const belowTop = spotlight.top + spotlight.height + GAP;
  const aboveTop = spotlight.top - GAP - card.height;
  const top = belowTop <= maxTop || aboveTop < minTop ? belowTop : aboveTop;
  return { top: Math.min(Math.max(minTop, top), maxTop), left };
}

export default function AppTour() {
  const { shouldShowTour, completeTour } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [running, setRunning] = useState(false);
  const cardRef = useRef(null);
  const [cardStyle, setCardStyle] = useState({});
  // Once the tour has started this session, never restart it — shouldShowTour can flicker
  // back to true later (e.g. a background profile refetch racing the completeTour() write),
  // and without this guard that flicker would replay the whole tour mid-session.
  const startedRef = useRef(false);

  useEffect(() => {
    if (shouldShowTour && !startedRef.current) {
      startedRef.current = true;
      setRunning(true);
    }
  }, [shouldShowTour]);

  const step = STEPS[index];

  const measure = useCallback(() => {
    if (!step?.target) { setRect(null); return; }
    const node = document.querySelector(step.target);
    if (!node) { setRect(null); return; }
    const box = node.getBoundingClientRect();
    if (!box.width && !box.height) { setRect(null); return; }
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, [step]);

  // Send the tour to the page that actually owns this step's target, instead of spotlighting
  // a nav link from wherever the user happened to be.
  useEffect(() => {
    if (!running || !step.route) return undefined;
    if (location.pathname !== step.route) navigate(step.route, { replace: true });
    return undefined;
  }, [running, step, location.pathname, navigate]);

  useEffect(() => {
    if (!running) return undefined;
    const node = step?.target ? document.querySelector(step.target) : null;
    if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Re-measure after the smooth scroll (and, when we just navigated, the new page mounting)
    // settles, then keep up with scroll/resize.
    measure();
    const timers = [80, 250, 450].map((delay) => setTimeout(measure, delay));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [running, step, measure, location.pathname]);

  const finish = useCallback(() => {
    setRunning(false);
    completeTour();
  }, [completeTour]);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current >= STEPS.length - 1) { finish(); return current; }
      return current + 1;
    });
  }, [finish]);

  useEffect(() => {
    if (!running) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight' || event.key === 'Enter') next();
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1));
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [running, finish, next]);

  const spotlight = useMemo(() => (rect ? {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  } : null), [rect]);

  // Position the card from the spotlight, then clamp against the card's real measured size so
  // it always sits fully on screen — the fixed positioning below never accounted for the
  // card's own height, so on short mobile viewports it could run off the bottom of the screen.
  useLayoutEffect(() => {
    if (!spotlight) { setCardStyle({}); return; }
    const node = cardRef.current;
    const card = { width: node?.offsetWidth || 340, height: node?.offsetHeight || 200 };
    setCardStyle(placeCard(spotlight, card, { width: window.innerWidth, height: window.innerHeight }, safeInsets()));
  }, [spotlight, step]);

  if (!running || !step) return null;

  const isLast = index === STEPS.length - 1;

  return <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Feature tour">
    {spotlight
      ? <div className="tour-spotlight" style={spotlight} />
      : <div className="tour-scrim" />}
    <div ref={cardRef} className={`tour-card ${spotlight ? '' : 'is-centered'}`} style={spotlight ? cardStyle : undefined}>
      <span className="eyebrow">{step.eyebrow}</span>
      <h2>{step.title}</h2>
      <p>{step.body}</p>
      <div className="tour-actions">
        <span className="tour-progress">{index + 1} / {STEPS.length}</span>
        <div className="tour-buttons">
          <button type="button" className="tour-skip" onClick={finish}>Skip</button>
          <button type="button" className="button button-primary tour-next" onClick={next}>
            {isLast ? 'Start fishing' : 'Next'} <span>→</span>
          </button>
        </div>
      </div>
    </div>
  </div>;
}
