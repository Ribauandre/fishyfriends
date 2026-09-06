import './App.css';
import React from 'react';
import Navbar from "./components/Navbar";
import FishYear from "./FishYear";
import FlukeTournament from './FlukeTournament';
import Home from './Home';
import AuthPage from './AuthPage';
import Profile from './Profile';
import { AuthProvider, useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading your dock...</div>;
  return user ? children : <Navigate to="/account" replace />;
}

function SpeciesDeck() {
  return <div className="species-deck" aria-hidden="true"><span className="deck-spark">✦</span><FishIllustration species="trout" className="deck-fish deck-fish-one" /><FishIllustration species="perch" className="deck-fish deck-fish-two" /><FishIllustration species="tuna" className="deck-fish deck-fish-three" /><FishIllustration species="pike" className="deck-fish deck-fish-four" /><span className="deck-hook">◆</span></div>;
}

function App() {
  return (
    <AuthProvider><Router><div className="App"><Navbar /><SpeciesDeck /><div className="page-wrapper"><Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/account" element={<AuthPage />} />
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/fluke-tournament" element={<ProtectedRoute><FlukeTournament /></ProtectedRoute>} />
      <Route path="/fish-year" element={<ProtectedRoute><FishYear /></ProtectedRoute>} />
    </Routes></div></div></Router></AuthProvider>
  );
}

export default App;
