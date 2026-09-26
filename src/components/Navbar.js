import React, { useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import { SECTIONS, destinationFor, pageFor, rememberPage } from '../utils/navSections';

const ICONS = {
  home: <path d="M3 11 12 3.5 21 11M5.5 9v11.5h5v-6h3v6h5V9" />,
  trophy: <><path d="M7.5 3.5h9v5a4.5 4.5 0 0 1-9 0z" /><path d="M7.5 5.5H4v1.5A3.5 3.5 0 0 0 7.8 10.5M16.5 5.5H20v1.5a3.5 3.5 0 0 1-3.8 3.5M12 13v4M8 20.5h8M9.5 17h5v3.5h-5z" /></>,
  crew: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20.5c0-3.8 2.9-6.5 6.5-6.5s6.5 2.7 6.5 6.5M15.5 4.7a3.5 3.5 0 0 1 0 6.6M18 14.4c2.1.9 3.5 3 3.5 6.1" /></>,
  map: <><path d="M3 6.5 9 3.5l6 3 6-3v14l-6 3-6-3-6 3z" /><path d="M9 3.5v14M15 6.5v14" /></>,
  game: <><rect x="2.5" y="7" width="19" height="11" rx="5.5" /><path d="M7.5 10.5v4M5.5 12.5h4" /><circle cx="15.5" cy="11.5" r=".6" /><circle cx="17.5" cy="13.8" r=".6" /></>,
};

function NavIcon({ name }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

export default function Navbar() {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => { rememberPage(pathname); }, [pathname]);
  if (!user) return null;
  const current = pageFor(pathname)?.section.key;
  // The game owns the whole phone screen, so there the top bar steps aside and only the tabs stay.
  const onGame = pathname === '/fishing-game';
  return (
    <header className={onGame ? 'navbar is-game' : 'navbar'}>
      <Link to="/home" className="brand-mark nav-brand"><span>FF</span><div><strong>Fishy Friends</strong><small>Friends, fish, and bragging rights</small></div></Link>
      <nav className="nav-links" aria-label="Main">
        {SECTIONS.map((section, index) => {
          const active = section.key === current;
          return <Link key={section.key} to={destinationFor(section, pathname)} className={active ? 'nav-link active' : 'nav-link'} aria-current={active ? 'page' : undefined}>
            <NavIcon name={section.icon} /><span className="nav-index">{String(index + 1).padStart(2, '0')}</span> <em>{section.label}</em>
          </Link>;
        })}
      </nav>
      <div className="navbar-right">
        <NotificationBell />
        <NavLink to="/profile" className="profile-pill" aria-label="Your profile"><span className="avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || 'N').slice(0, 1).toUpperCase()}</span><span className="profile-pill-name">{profile.display_name || 'Profile'}</span><span className="profile-pill-arrow">↗</span></NavLink>
      </div>
    </header>
  );
}
