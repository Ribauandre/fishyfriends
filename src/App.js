import './App.css';
import React from 'react';
import Navbar from "./components/Navbar";
import AppTour from './components/AppTour';
import FishYear from "./FishYear";
import Tournaments from './Tournaments';
import TournamentDetail from './TournamentDetail';
import Home from './Home';
import AuthPage from './AuthPage';
import Profile from './Profile';
import Anglers from './Anglers';
import FishingGame from './FishingGame';
import AdminBugReports from './AdminBugReports';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading your dock...</div>;
  return user ? children : <Navigate to="/account" replace />;
}

function App() {
  return (
    <AuthProvider><Router><div className="App"><Navbar /><AppTour /><div className="page-wrapper"><Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/account" element={<AuthPage />} />
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/fluke-tournament" element={<Navigate to="/tournaments" replace />} />
      <Route path="/tournaments" element={<ProtectedRoute><Tournaments /></ProtectedRoute>} />
      <Route path="/tournaments/:tournamentId" element={<ProtectedRoute><TournamentDetail /></ProtectedRoute>} />
      <Route path="/fish-year" element={<ProtectedRoute><FishYear /></ProtectedRoute>} />
      <Route path="/anglers" element={<ProtectedRoute><Anglers /></ProtectedRoute>} />
      <Route path="/fishing-game" element={<ProtectedRoute><FishingGame /></ProtectedRoute>} />
      <Route path="/admin/bugs" element={<ProtectedRoute><AdminBugReports /></ProtectedRoute>} />
    </Routes></div></div></Router></AuthProvider>
  );
}

export default App;
