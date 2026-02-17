import './App.css';
import React from 'react';
import Navbar from "./components/Navbar";
import FishYear from "./FishYear";
import FlukeTournament from './FlukeTournament';
import Home from './Home';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  // Scroll handling moved to FlukeTournament component
  return (
    <Router>
      <div className="App">
        <Navbar />

        <div className="page-wrapper">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/fluke-tournament" element={<FlukeTournament />} />
            <Route path="/fish-year" element={<FishYear />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
