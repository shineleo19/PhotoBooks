// src/components/TopNav.jsx
import { useEffect, useRef, useState } from 'react';
import {
  Search,
  Moon,
  Sun,
  Sparkles,
  Bell,
  Grid,
  AlertTriangle,
  TrendingUp,
  Receipt,
  Check,
} from 'lucide-react';

export default function TopNav({
  onOpenSearch,
  onOpenBilling,
  notifications = [],
  onMarkNotificationsRead,
  darkMode = false,
  onToggleDarkMode,
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleOpenNotifications = () => {
    setShowNotifications(true);
    if (unreadCount > 0 && onMarkNotificationsRead) {
      onMarkNotificationsRead();
    }
  };

  return (
    <header className="h-[68px] bg-white border-b border-gray-200/80 flex items-center justify-between px-6 sticky top-0 z-20 w-full print:hidden transition-colors duration-200">
      {/* 560px Wide Search Bar */}
      <div
        onClick={onOpenSearch}
        className="flex items-center justify-between w-full max-w-[560px] h-[44px] bg-[#f8f9fb] hover:bg-gray-100/80 rounded-xl border border-gray-200/90 px-4 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3 text-gray-400">
          <Search size={18} />
          <span className="text-[15px] text-gray-400 font-normal">Search</span>
        </div>
        <kbd className="bg-white border border-gray-200 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 shadow-2xs">
          Ctrl+K
        </kbd>
      </div>

      {/* Right Action Icons */}
      <div className="flex items-center gap-5 text-gray-500 relative">
        {/* Quick Billing Button */}
        <button
          onClick={onOpenBilling}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold transition-colors cursor-pointer"
          title="Open GST Billing POS"
        >
          <Receipt size={16} />
          <span>Billing</span>
        </button>

        {/* Working Dark Mode Toggle Button */}
        <button
          onClick={onToggleDarkMode}
          className={`p-2 rounded-xl transition-colors cursor-pointer ${
            darkMode
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'hover:bg-gray-100 hover:text-gray-800 text-gray-500'
          }`}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button
          onClick={onOpenSearch}
          className="hover:text-gray-800 transition-colors cursor-pointer"
          title="Ask AI & Search"
        >
          <Sparkles size={20} />
        </button>

        <div ref={notificationsRef}>
          {/* Notification Bell with Unread Red Dot */}
          <button
            onClick={handleOpenNotifications}
            className="hover:text-gray-800 transition-colors relative cursor-pointer"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
            )}
          </button>

          {/* Live Alerts Dropdown */}
          {showNotifications && (
            <div className="absolute top-12 right-28 w-88 bg-white border border-gray-200 shadow-xl rounded-2xl overflow-hidden z-50">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-800 flex justify-between items-center">
              <span>Live Business Alerts</span>
              <span className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                <Check size={14} /> All read
              </span>
            </div>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="p-6 text-center text-xs text-gray-400">No alerts right now.</p>
              ) : (
                notifications.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-gray-50 flex gap-3">
                    {item.type === 'warning' ? (
                      <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    ) : (
                      <TrendingUp size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            </div>
          )}
        </div>

        <button className="hover:text-gray-800 transition-colors">
          <Grid size={20} />
        </button>
      </div>
    </header>
  );
}