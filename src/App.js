import './App.css';
import React from 'react';
import Navbar from "./components/Navbar";
import AppTour from './components/AppTour';
import UpdateBanner from './components/UpdateBanner';
import SectionTabs from './components/SectionTabs';
import FishYear from "./FishYear";
import Tournaments from './Tournaments';
import TournamentDetail from './TournamentDetail';
import Home from './Home';
import AuthPage from './AuthPage';
import Profile from './Profile';
import Anglers from './Anglers';
import FishingGame from './FishingGame';
import AdminBugReports from './AdminBugReports';
import Waypoints from './Waypoints';
import WaypointDetail from './WaypointDetail';
import Trips from './Trips';
import TripDetail from './TripDetail';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { rememberReturnTo, takeReturnTo } from './utils/returnTo';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-screen">Loading your dock...</div>;
  if (user) return children;
  // Signed out on a link someone shared: sign in, then land on it rather than on Home.
  const from = `${location.pathname}${location.search}${location.hash}`;
  rememberReturnTo(from);
  return <Navigate to="/account" replace state={{ from }} />;
}

// The front door, where a sign-up's confirmation email lands: pick up the link that was
// opened before signing up, if there was one.
function RootRedirect() {
  const [to] = React.useState(() => takeReturnTo() || '/home');
  return <Navigate to={to} replace />;
}

function App() {
  return (
    <AuthProvider><Router><div className="App"><Navbar /><AppTour /><UpdateBanner /><div className="page-wrapper"><SectionTabs /><Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/account" element={<AuthPage />} />
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/fluke-tournament" element={<Navigate to="/tournaments" replace />} />
      <Route path="/tournaments" element={<ProtectedRoute><Tournaments /></ProtectedRoute>} />
      <Route path="/tournaments/:tournamentId" element={<ProtectedRoute><TournamentDetail /></ProtectedRoute>} />
      <Route path="/fish-year" element={<ProtectedRoute><FishYear /></ProtectedRoute>} />
      <Route path="/anglers" element={<ProtectedRoute><Anglers /></ProtectedRoute>} />
      <Route path="/waypoints" element={<ProtectedRoute><Waypoints /></ProtectedRoute>} />
      <Route path="/waypoints/:mapId" element={<ProtectedRoute><WaypointDetail /></ProtectedRoute>} />
      <Route path="/trips" element={<ProtectedRoute><Trips /></ProtectedRoute>} />
      <Route path="/trips/:tripId" element={<ProtectedRoute><TripDetail /></ProtectedRoute>} />
      <Route path="/fishing-game" element={<ProtectedRoute><FishingGame /></ProtectedRoute>} />
      <Route path="/admin/bugs" element={<ProtectedRoute><AdminBugReports /></ProtectedRoute>} />
    </Routes></div></div></Router></AuthProvider>
  );
}

export default App;
