import React from 'react';
import FishIcon from './components/FishIcon';

export default function Home() {
  return (
    <div className="home-page">
      <header className="App-header">
        <h1>Fishy Friends</h1>
        <p>Your community for fishing Challenges, leaderboards, and season highlights.</p>
        <hr/>
          <FishIcon className="header-fish" />
      </header>
    </div>
  );
}
