import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Each step points at a real element via its data-tour attribute. A step whose target is
// missing (element not on the current route, or hidden at this breakpoint) still shows —
// it just renders centred with no spotlight instead of being skipped, so the walkthrough
// always covers every feature.
const STEPS = [
  {
    target: null,
    eyebrow: 'Welcome aboard',
    title: 'Here\'s the quick tour.',
    body: 'Sixty seconds on what this place does, then you can get back to lying about fish sizes.',
  },
  {
    target: '[data-tour="fish-year-card"]',
    eyebrow: 'The main event',
    title: 'Fish Year',
    body: 'One fish a month, every month. This card tracks how many of the twelve you\'ve actually landed.',
  },
  {
    target: '[data-tour="nav-fish-year"]',
    eyebrow: 'Log a catch',
    title: 'Post your proof',
    body: 'Add a photo and the species. We\'ll read the date off the photo so you can\'t backdate a fish you caught in July.',
  },
  {
    target: '[data-tour="nav-anglers"]',
    eyebrow: 'The crew',
    title: 'Anglers and personal bests',
    body: 'Everyone\'s biggest fish by species. Tap an angler to open their personal bests, then go beat one.',
  },
  {
    target: '[data-tour="nav-tournaments"]',
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
    target: '[data-tour="profile-pill"]',
    eyebrow: 'Last stop',
    title: 'Your profile',
    body: 'Set your photo, home water, and favourite species — and log the personal bests everyone else is trying to beat.',
  },
];

const PADDING = 8;

export default function AppTour() {
  const { shouldShowTour, completeTour } = useAuth();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [running, setRunning] = useState(false);

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

  useEffect(() => {
    if (!running) return undefined;
    const node = step?.target ? document.querySelector(step.target) : null;
    if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Re-measure after the smooth scroll settles, then keep up with scroll/resize.
    measure();
    const settle = setTimeout(measure, 380);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [running, step, measure]);

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

  if (!running || !step) return null;

  const isLast = index === STEPS.length - 1;
  const spotlight = rect ? {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  } : null;

  // Prefer sitting under the target; flip above when there isn't room below.
  let cardStyle = {};
  if (spotlight) {
    const below = spotlight.top + spotlight.height + 14;
    const roomBelow = window.innerHeight - below > 210;
    cardStyle = roomBelow
      ? { top: below, left: Math.min(Math.max(12, spotlight.left), Math.max(12, window.innerWidth - 352)) }
      : { bottom: window.innerHeight - spotlight.top + 14, left: Math.min(Math.max(12, spotlight.left), Math.max(12, window.innerWidth - 352)) };
  }

  return <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Feature tour">
    {spotlight
      ? <div className="tour-spotlight" style={spotlight} />
      : <div className="tour-scrim" />}
    <div className={`tour-card ${spotlight ? '' : 'is-centered'}`} style={cardStyle}>
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
