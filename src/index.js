import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { announceUpdate } from './utils/appUpdate';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Makes the site installable and keeps its static shell available offline; a new deploy is
// offered by the update banner (see serviceWorkerRegistration.js and utils/appUpdate.js).
serviceWorkerRegistration.register({ onUpdate: announceUpdate });

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
