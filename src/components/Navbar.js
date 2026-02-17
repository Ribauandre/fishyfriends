import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-left">Fishy Friends</div>
      <div className="nav-links">
        <NavLink to="/home" end className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          Home
        </NavLink>
        <NavLink to="/fluke-tournament" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          Fluke Tournament
        </NavLink>
        <NavLink to="/fish-year" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          Fish Year
        </NavLink>
      </div>
    </nav>
  );
}
