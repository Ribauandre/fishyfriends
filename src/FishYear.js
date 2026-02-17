import React from 'react';
import Participants from './components/Participants.tsx';

export default function FishYear() {
  return (
    <div className="fish-year-page">
      <header className="App-header">
        <h1>Fish Year</h1>
        <p>Catch one fish a month challenge.</p>
        <hr/>
      </header>
      <div className="wave-wrapper">
        <div className="wave" id="wave1" ></div>
        <div className="wave" id="wave2" ></div>
        <div className="wave" id="wave3" ></div>
        <div className="wave" id="wave4" ></div>
      </div>
      <div className="Leaderboard-wrapper">
        <Participants />
      </div>
      <hr/>
      <div className="rules-wrapper">
        <h3>Rules</h3>
        <p>Catch at least one fish a month and take a photo of it to submit to the Fish Year Challenge.</p>
      </div>
    </div>
  );
}
