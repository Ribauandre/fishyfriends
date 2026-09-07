import './App.css';
import React from 'react';
import Navbar from "./components/Navbar";
import AppTour from './components/AppTour';
import FishYear from "./FishYear";
import FlukeTournament from './FlukeTournament';
import Home from './Home';
import AuthPage from './AuthPage';
import Profile from './Profile';
import Anglers from './Anglers';
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
      <Route path="/fluke-tournament" element={<ProtectedRoute><FlukeTournament /></ProtectedRoute>} />
      <Route path="/fish-year" element={<ProtectedRoute><FishYear /></ProtectedRoute>} />
      <Route path="/anglers" element={<ProtectedRoute><Anglers /></ProtectedRoute>} />
    </Routes></div></div></Router></AuthProvider>
  );
}

export default App;
