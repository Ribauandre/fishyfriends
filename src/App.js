import './App.css';
import Leaderboard from "./components/Leaderboard.tsx"
function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Fluke Tournament 2025! 🐟</h1>
        <p>Whoever catches the biggest fluke of the season wins!</p>
        <h2>Leaderboard</h2>
      </header>
      
      <div className="Leaderboard-wrapper">
        <Leaderboard/>
      </div>
      <h3>Rules</h3>
      <p>1. Have to take a pic with the fish on the tape measure</p>
      <p>2. Has to be caught durring NJ open season May 4th - Sept 25th</p>
    </div>
  );
}

export default App;
