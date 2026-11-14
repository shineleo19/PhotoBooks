// src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from './api';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import BrowserTabs from './components/BrowserTabs';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import BillingPOS from './components/BillingPOS';
import TodaySales from './components/TodaySales';
import PendingActions from './components/PendingActions';
import SearchModal from './components/SearchModal';


const defaultBusinessInfo = {
  businessName: 'PHOTO BOOKS',
  email: 'billing@photobooks.in',
  phone: '8754540404',
  supportPhone: '8754540404',
  gstin: '33ABEPB960D1Z7',
  address: '10/1.11/1 Parasakthi building upstairs Madrai road, Tirunelveli junction Tirunelveli',
  upiId: 'photobooks@icici',
  terminalId: 'POS-MAIN-01',
};

const tracksStock = (item) => item.stockTracked !== false && item.stockTracked !== 0;
const NOTIFICATIONS_STORAGE_KEY = 'businessos_notifications_v1';
const MAX_NOTIFICATIONS = 30;
const isSampleNotification = (notification) =>
  notification.id === 'startup-low-stock' ||
  notification.id === 'startup-ready' ||
  notification.title === 'Studio System Ready' ||
  (notification.title === 'Low Raw Material Alert' &&
    notification.message === 'Double-Sided Red Tape & Binding Gum are below minimum level.');

const normalizeNotifications = (value) =>
  Array.isArray(value)
    ? value
        .filter((notification) => notification && notification.id && !isSampleNotification(notification))
        .map((notification) => ({
          id: String(notification.id),
          type: notification.type || 'info',
          title: String(notification.title || ''),
          message: String(notification.message || ''),
          createdAt: notification.createdAt || new Date(0).toISOString(),
          read: notification.read === true,
        }))
        .slice(0, MAX_NOTIFICATIONS)
    : [];

export default function App() {
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('businessos_theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('businessos_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('businessos_theme', 'light');
    }
  }, [darkMode]);

  const [businessInfo, setBusinessInfo] = useState(() => {
    try {
      const saved = localStorage.getItem('businessos_profile_v2');
      return saved ? JSON.parse(saved) : defaultBusinessInfo;
    } catch {
      return defaultBusinessInfo;
    }
  });

  useEffect(() => {
    localStorage.setItem('businessos_profile_v2', JSON.stringify(businessInfo));
  }, [businessInfo]);

  const [items, setItems] = useState([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [notificationState, setNotificationState] = useState(() => {
    try {
      const saved = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (saved !== null) {
        const normalized = normalizeNotifications(JSON.parse(saved));
        return {
          notifications: normalized,
          snapshot: saved,
        };
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }

    return { notifications: [], snapshot: null };
  });
  const notifications = notificationState.notifications;
  const notificationStorageSnapshot = useRef(notificationState.snapshot);
  const setNotifications = (updater) => {
    setNotificationState((current) => {
      const nextNotifications =
        typeof updater === 'function' ? updater(current.notifications) : updater;
      if (nextNotifications === current.notifications) return current;
      return {
        notifications: nextNotifications,
        snapshot: current.snapshot,
      };
    });
  };
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const serialized = JSON.stringify(notifications);
    if (serialized === notificationStorageSnapshot.current) return;

    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, serialized);
      notificationStorageSnapshot.current = serialized;
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  }, [notifications]);

  useEffect(() => {
    if (!itemsLoaded) return;

    const activeLowStockIds = new Set(
      items
        .filter((item) => tracksStock(item) && item.stock <= item.minStock)
        .map((item) => `low-stock-${item.id}`)
    );
    setNotifications((current) => {
      const next = current.filter(
        (notification) =>
          !notification.id.startsWith('low-stock-') ||
          activeLowStockIds.has(notification.id)
      );
      return next.length === current.length ? current : next;
    });
  }, [items, itemsLoaded]);

  const [openTabs, setOpenTabs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('businessos_open_tabs') || 'null');
      const restoredTabs = Array.isArray(saved)
        ? saved.map((tab) =>
            tab.id === 'TodaySales' ? { ...tab, name: 'Revenue & Audit' } : tab
          )
        : null;
      return Array.isArray(restoredTabs) && restoredTabs.some((tab) => tab.id === 'Dashboard')
        ? restoredTabs
        : [{ id: 'Dashboard', name: 'Dashboard' }];
    } catch {
      return [{ id: 'Dashboard', name: 'Dashboard' }];
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('businessos_active_tab');
    return savedTab || 'Dashboard';
  });

  useEffect(() => {
    localStorage.setItem('businessos_open_tabs', JSON.stringify(openTabs));
  }, [openTabs]);

  useEffect(() => {
    localStorage.setItem('businessos_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!openTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(openTabs[openTabs.length - 1]?.id || 'Dashboard');
    }
  }, [activeTab, openTabs]);

  useEffect(() => {
    const fetchItems = fetch(`${API_BASE_URL}/api/items`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
      })
      .catch((err) => console.error('Failed to load items:', err))
      .finally(() => setItemsLoaded(true));

    const fetchSales = fetch(`${API_BASE_URL}/api/sales`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setSales(data);
      })
      .catch((err) => console.error('Failed to load sales:', err));

    const fetchCustomers = fetch(`${API_BASE_URL}/api/customers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setCustomers(data);
      })
      .catch((err) => console.error('Failed to load customers:', err));

    Promise.allSettled([fetchItems, fetchSales, fetchCustomers]);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openPage = (id, name) => {
    setOpenTabs((currentTabs) =>
      currentTabs.find((tab) => tab.id === id)
        ? currentTabs
        : [...currentTabs, { id, name }]
    );
    setActiveTab(id);
  };

  const closeTab = (id, e) => {
    e.stopPropagation();
    if (id === 'Dashboard') return;
    setOpenTabs((currentTabs) => {
      const filtered = currentTabs.filter((tab) => tab.id !== id);
      if (activeTab === id && filtered.length > 0) {
        setActiveTab(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  };

  const notify = (title, message, type = 'info', notificationId) => {
    const notification = {
      id: notificationId || `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      title,
      message,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setNotifications((current) => {
      if (current.some((item) => item.id === notification.id)) return current;
      return [notification, ...current].slice(0, MAX_NOTIFICATIONS);
    });
    setToast(notification);
    window.setTimeout(() => {
      setToast((current) => (current?.id === notification.id ? null : current));
    }, 4000);
  };

  const markNotificationsRead = () => {
    setNotifications((current) => {
      if (!current.some((notification) => !notification.read)) return current;
      return current.map((notification) => ({ ...notification, read: true }));
    });
  };

  const handleCompleteBill = (billRecord, updatedCustomers, updatedInventory, deductedMaterialIds = []) => {
    const authoritativeItems = Array.isArray(updatedInventory) ? updatedInventory : items;
    const deductedIds = new Set(deductedMaterialIds);
    const newAlerts = authoritativeItems.flatMap((item) => {
      if (!deductedIds.has(item.id) || !tracksStock(item)) return [];
      return item.stock <= item.minStock
        ? [
            {
              id: `low-stock-${item.id}`,
              type: 'warning',
              title: 'Low Raw Material Alert',
              message: `${item.name} is at ${item.stock} units after billing.`,
            },
          ]
        : [];
    });
    setSales((currentSales) => [billRecord, ...currentSales]);
    if (Array.isArray(updatedInventory)) setItems(updatedInventory);
    if (Array.isArray(updatedCustomers)) setCustomers(updatedCustomers);

    notify(
      `Invoice Confirmed (${billRecord.invoiceNo})`,
      `Billed ₹${billRecord.grandTotal.toFixed(2)} to ${billRecord.customerName}.`,
      'sale'
    );
    newAlerts.forEach((alert) =>
      notify(alert.title, alert.message, alert.type, alert.id)
    );
  };

  // In src/App.jsx, add this handler right below handleCompleteBill:
const handlePayCustomerBalance = async (customerId, amountPaid) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pay-customer-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, amountPaid }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Failed to record payment' };
    }

    if (Array.isArray(data.customers)) setCustomers(data.customers);
    if (Array.isArray(data.sales)) setSales(data.sales);

    notify('Customer Payment Received', data.message, 'sale');

    return { success: true, message: data.message };
  } catch (err) {
    return { success: false, error: err.message };
  }
};  

  return (
    <div className="min-h-screen w-full min-w-0 flex overflow-x-hidden bg-[#f8f9fb] transition-colors duration-200">
      

      <Sidebar
        isPinned={isSidebarPinned}
        setIsPinned={setIsSidebarPinned}
        isHovered={isSidebarHovered}
        setIsHovered={setIsSidebarHovered}
        activeTab={activeTab}
        openPage={openPage}
      />

      <main
        className="min-w-0 flex-none flex min-h-screen flex-col transition-all duration-200"
        style={{
          marginLeft: isSidebarPinned ? '16rem' : '68px',
          width: `calc(100% - ${isSidebarPinned ? '16rem' : '68px'})`,
        }}
      >
        <TopNav
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenBilling={() => openPage('GSTInvoices', 'GST Billing')}
          notifications={notifications}
          onMarkNotificationsRead={markNotificationsRead}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        />
        {toast && (
          <div
            role="status"
            className="fixed right-6 top-20 z-[60] w-[min(380px,calc(100vw-3rem))] rounded-2xl border border-indigo-100 bg-white px-5 py-4 shadow-xl print:hidden"
          >
            <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
            <p className="mt-1 text-xs text-gray-500">{toast.message}</p>
          </div>
        )}

        <BrowserTabs
          tabs={openTabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          closeTab={closeTab}
        />

        <div className="min-w-0 flex-1 w-full p-6">
          {activeTab === 'Dashboard' && (
            <Dashboard
              openPage={openPage}
              items={items}
              sales={sales}
              businessInfo={businessInfo}
              setBusinessInfo={setBusinessInfo}
            />
          )}
          {['Inventory', 'InventoryOverview', 'InventoryManagement', 'StockManagement'].includes(
            activeTab
          ) && (
            <Inventory
              items={items}
              setItems={setItems}
              initialTab={
                activeTab === 'InventoryManagement'
                  ? 'inventory'
                  : activeTab === 'StockManagement'
                    ? 'stock'
                    : 'overview'
              }
              onNotify={notify}
            />
          )}
          {['GSTInvoices', 'BillingHistory'].includes(activeTab) && (
          <BillingPOS
            items={items}
            setItems={setItems}
            sales={sales}
            customers={customers}
            setCustomers={setCustomers}
            onCompleteBill={handleCompleteBill}
            businessInfo={businessInfo}
            initialSubTab={activeTab === 'BillingHistory' ? 'history' : 'pos'}
            onNotify={notify}
          />
        )}
        {['PendingActions', 'CustomerBalances'].includes(activeTab) && (
          <PendingActions
            key={activeTab}
            items={items}
            customers={customers}
            onPayCustomerBalance={handlePayCustomerBalance}
            onCustomersImported={setCustomers}
            openPage={openPage}
            initialSection={activeTab === 'CustomerBalances' ? 'customers' : 'balances'}
            onNotify={notify}
          />
        )}
          {activeTab === 'TodaySales' && <TodaySales sales={sales} />}
          
        </div>
      </main>

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        openPage={openPage}
        items={items}
        sales={sales}
      />
    </div>
  );
}