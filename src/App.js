import './App.css';
import React from 'react';
import Leaderboard from "./components/Leaderboard.tsx"

function App() {
  const { useState, useEffect } = React;

  
  useEffect(() => {
    const handleScroll = () => {
      let wave1 = document.getElementById("wave1");
      let wave2 = document.getElementById("wave2");
      let wave3 = document.getElementById("wave3");
      let wave4 = document.getElementById("wave4");
      let value = window.scrollY
      wave1.style.backgroundPositionX = 400 + value * 4 + "px";
      wave2.style.backgroundPositionX = 300 + value * -4 + "px";
      wave3.style.backgroundPositionX = 200 + value * 2 + "px";
      wave4.style.backgroundPositionX = 100 + value * -2 + "px";
    
    };
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Fluke Tournament 2025! 🐟</h1>
        <p>Whoever catches the biggest fluke of the season wins!</p>
        <hr/>
        <h2>Leaderboard</h2>
      </header>
      <div className="wave-wrapper">
        <div className="wave" id="wave1" ></div>
        <div className="wave" id="wave2" ></div>
        <div className="wave" id="wave3" ></div>
        <div className="wave" id="wave4" ></div>
      </div>
      <div className="Leaderboard-wrapper">
        <Leaderboard/>
      </div>
      <hr/>
      <div className="rules-wrapper">
        <h3>Rules</h3>
        <p>1. Have to take a pic with the fish on the tape measure</p>
        <p>2. Has to be caught durring NJ open season May 4th - Sept 25th</p>
      </div>
    </div>
  );
}

export default App;
