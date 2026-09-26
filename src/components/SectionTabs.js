import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SECTIONS } from '../utils/navSections';

// Sub-tabs across the top of a section with more than one page (Compete: Fish Year and
// Tournaments; Plan: Trips and Waypoints). Shown on those pages themselves, not on a single
// tournament or trip, which have their own way back.
export default function SectionTabs() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null;
  const section = SECTIONS.find((candidate) => candidate.pages.length > 1 && candidate.pages.some((page) => page.to === pathname));
  if (!section) return null;
  return <nav className="section-tabs content-shell" aria-label={section.label}>
    {section.pages.map((page) => <NavLink key={page.to} to={page.to} className={({ isActive }) => (isActive ? 'section-tab active' : 'section-tab')}>{page.label}</NavLink>)}
  </nav>;
}
