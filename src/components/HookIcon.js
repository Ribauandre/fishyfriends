import React from 'react';

export default function HookIcon({ className = '' }) {
  return <svg className={`hook-icon ${className}`} viewBox="0 0 24 26" role="presentation" aria-hidden="true">
    <circle cx="12" cy="3" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 5v10a5.5 5.5 0 1 0 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M15.6 22.2l3.2 2.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>;
}
