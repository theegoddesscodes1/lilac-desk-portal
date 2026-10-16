import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './portal-styles.css';
import { watchForUpdates } from './lib/appVersion';

watchForUpdates();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
