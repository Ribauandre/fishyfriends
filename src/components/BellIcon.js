import React from 'react';

export default function BellIcon({ className = '' }) {
  return <svg className={`bell-icon ${className}`} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
    <path d="M12 3.5c-3 0-5 2.2-5 5.5v3.2c0 1-.4 2-1.1 2.7L5 15.8V17h14v-1.2l-.9-.9c-.7-.7-1.1-1.7-1.1-2.7V9c0-3.3-2-5.5-5-5.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.5 20a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
