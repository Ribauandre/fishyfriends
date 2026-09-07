import React from 'react';

export default function ChatIcon({ className = '' }) {
  return <svg className={`chat-icon ${className}`} viewBox="0 0 24 22" role="presentation" aria-hidden="true">
    <path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
