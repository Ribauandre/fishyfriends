import React from 'react';
import FishIcon from './components/FishIcon';

export default function Home() {
  return (
    <div className="home-page">
      <header className="App-header site-hero">
        <div className="hero-content">
          <h1 className="hero-title">Fishy Friends</h1>
          <p className="hero-sub">Your community for fishing challenges, leaderboards, and season highlights.</p>
          <div className="header-center">
            <FishIcon className="header-fish" />
          </div>
        </div>
        <hr />
      </header>
    </div>
  );
}
