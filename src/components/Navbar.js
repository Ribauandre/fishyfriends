import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, profile } = useAuth();
  if (!user) return null;
  return (
    <nav className="navbar">
      <NavLink to="/home" className="brand-mark nav-brand"><span>FF</span><div><strong>Fishy Friends</strong><small>Community fishing log</small></div></NavLink>
      <div className="nav-links">
        <NavLink to="/home" end className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span>01</span> Home
        </NavLink>
        <NavLink to="/fluke-tournament" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span>02</span> Tournaments
        </NavLink>
        <NavLink to="/fish-year" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span>03</span> Fish Year
        </NavLink>
      </div>
      <NavLink to="/profile" className="profile-pill"><span className="avatar">{(profile.display_name || 'N').slice(0, 1).toUpperCase()}</span><span className="profile-pill-name">{profile.display_name || 'Profile'}</span><span>↗</span></NavLink>
    </nav>
  );
}
