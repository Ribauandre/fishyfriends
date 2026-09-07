import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BellIcon from './BellIcon';
import ChatIcon from './ChatIcon';

const POLL_INTERVAL_MS = 30000;

function targetHref(notification) {
  return notification.target_type === 'personal_best'
    ? `/anglers?best=${notification.target_id}`
    : `/fish-year?catch=${notification.target_id}`;
}

function describe(notification) {
  const action = notification.type === 'like' ? 'liked' : 'commented on';
  const thing = notification.target_type === 'personal_best' ? 'your personal best' : 'your catch';
  return `${notification.actor_name} ${action} ${thing}`;
}

export default function NotificationBell() {
  const { listNotifications, markNotificationRead, markAllNotificationsRead } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef(null);

  async function refresh() {
    const data = await listNotifications();
    setNotifications(data);
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  function handleToggle() {
    setOpen((previous) => !previous);
  }

  async function handleSelect(notification) {
    setOpen(false);
    if (!notification.read) {
      setNotifications((previous) => previous.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
      await markNotificationRead(notification.id);
    }
    navigate(targetHref(notification));
  }

  async function handleMarkAllRead() {
    setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
    await markAllNotificationsRead();
  }

  return <div className="notification-bell" ref={containerRef}>
    <button type="button" className="notification-bell-trigger" onClick={handleToggle} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={open}>
      <BellIcon />
      {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
    {open && <div className="notification-panel">
      <div className="notification-panel-head">
        <strong>Notifications</strong>
        {unreadCount > 0 && <button type="button" className="notification-mark-all" onClick={handleMarkAllRead}>Mark all read</button>}
      </div>
      {notifications.length === 0 && <p className="month-empty">Nothing yet. Get out there and catch something.</p>}
      <div className="notification-list">
        {notifications.map((notification) => <button type="button" key={notification.id} className={`notification-row ${notification.read ? '' : 'is-unread'}`} onClick={() => handleSelect(notification)}>
          <span className="notification-icon">{notification.type === 'like' ? <span aria-hidden="true">♥</span> : <ChatIcon />}</span>
          <span className="notification-text"><strong>{describe(notification)}</strong>{notification.preview && <em>"{notification.preview}"</em>}</span>
        </button>)}
      </div>
    </div>}
  </div>;
}
