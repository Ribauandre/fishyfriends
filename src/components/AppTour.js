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
    route: '/home',
    eyebrow: 'The main event',
    title: 'Fish Year',
    body: 'One fish a month, every month. This card tracks how many of the twelve you\'ve actually landed.',
  },
  {
    target: '[data-tour="log-catch-button"]',
    route: '/fish-year',
    eyebrow: 'Log a catch',
    title: 'Post your proof',
    body: 'Add a photo and the species. We\'ll read the date off the photo so you can\'t backdate a fish you caught in July.',
  },
  {
    target: '[data-tour="anglers-intro"]',
    route: '/anglers',
    eyebrow: 'The crew',
    title: 'Anglers and personal bests',
    body: 'Everyone\'s biggest fish by species. Tap an angler to open their personal bests, then go beat one.',
  },
  {
    target: '[data-tour="tournament-highlight"]',
    route: '/fluke-tournament',
    eyebrow: 'Bragging rights',
    title: 'Tournaments',
    body: 'Past seasons and final standings, kept around permanently so the winner can keep bringing it up.',
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
    body: 'Set your photo, home water, and favourite species — and log the personal bests everyone else is trying to beat.',
  },
];

const PADDING = 8;
const MARGIN = 12;
const GAP = 14;

export default function AppTour() {
  const { shouldShowTour, completeTour } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [running, setRunning] = useState(false);
  const cardRef = useRef(null);
  const [cardStyle, setCardStyle] = useState({});

  useEffect(() => {
    if (shouldShowTour) setRunning(true);
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
    const cardWidth = node?.offsetWidth || 340;
    const cardHeight = node?.offsetHeight || 200;
    const maxLeft = Math.max(MARGIN, window.innerWidth - cardWidth - MARGIN);
    const left = Math.min(Math.max(MARGIN, spotlight.left), maxLeft);
    const belowTop = spotlight.top + spotlight.height + GAP;
    const aboveTop = spotlight.top - GAP - cardHeight;
    const fitsBelow = belowTop + cardHeight + MARGIN <= window.innerHeight;
    let top = fitsBelow || aboveTop < MARGIN ? belowTop : aboveTop;
    top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, window.innerHeight - cardHeight - MARGIN));
    setCardStyle({ top, left });
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
