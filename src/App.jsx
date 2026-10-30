// src/App.jsx
import { useState, useEffect } from 'react';
import { API_BASE_URL } from './api';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import BrowserTabs from './components/BrowserTabs';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import BillingPOS from './components/BillingPOS';
import Warehouse from './components/Warehouse';
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

export default function App() {
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Page Loader States
  const [isLoading, setIsLoading] = useState(true);
  const [isLoaderExiting, setIsLoaderExiting] = useState(false);

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
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [notifications, setNotifications] = useState([
    {
      id: 'n1',
      type: 'warning',
      title: 'Low Raw Material Alert',
      message: 'Double-Sided Red Tape & Binding Gum are below minimum level.',
      read: false,
    },
    {
      id: 'n2',
      type: 'sale',
      title: 'Studio System Ready',
      message: 'Photo Books Tirunelveli GST billing & archive active.',
      read: false,
    },
  ]);

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
    const minDisplayTime = new Promise((resolve) => setTimeout(resolve, 1100));

    const fetchItems = fetch(`${API_BASE_URL}/api/items`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
      })
      .catch((err) => console.error('Failed to load items:', err));

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

    Promise.allSettled([fetchItems, fetchSales, fetchCustomers, minDisplayTime]).then(() => {
      setIsLoaderExiting(true);
      setTimeout(() => setIsLoading(false), 500);
    });
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

  const markNotificationsRead = () => {
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
  };

  const handleCompleteBill = (billRecord) => {
    const newAlerts = [];
    setSales((currentSales) => [billRecord, ...currentSales]);

    setItems((currentItems) =>
      currentItems.map((item) => {
        const billedItem = billRecord.items.find((b) => b.id === item.id);
        if (!billedItem) return item;

        const updatedStock = Math.max(0, item.stock - billedItem.qty);

        if (updatedStock <= item.minStock) {
          newAlerts.push({
            id: `low-${Date.now()}-${item.id}`,
            type: 'warning',
            title: 'Low Raw Material Alert',
            message: `${item.name} dropped to ${updatedStock} units after billing.`,
            read: false,
          });
        }

        return { ...item, stock: updatedStock };
      })
    );

    const saleNotification = {
      id: `bill-${Date.now()}`,
      type: 'sale',
      title: `Invoice Confirmed (${billRecord.invoiceNo})`,
      message: `Billed ₹${billRecord.grandTotal.toFixed(2)} to ${billRecord.customerName}.`,
      read: false,
    };

    setNotifications((current) => [saleNotification, ...newAlerts, ...current]);
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

    setNotifications((current) => [
      {
        id: `pay-${Date.now()}`,
        type: 'sale',
        title: 'Customer Pending Payment Received',
        message: data.message,
        read: false,
      },
      ...current,
    ]);

    return { success: true, message: data.message };
  } catch (err) {
    return { success: false, error: err.message };
  }
};  

  return (
    <div className="min-h-screen w-full flex bg-[#f8f9fb] transition-colors duration-200">
      

      <Sidebar
        isPinned={isSidebarPinned}
        setIsPinned={setIsSidebarPinned}
        isHovered={isSidebarHovered}
        setIsHovered={setIsSidebarHovered}
        activeTab={activeTab}
        openPage={openPage}
      />

      <main
        className={`flex-1 min-w-0 flex flex-col min-h-screen transition-all duration-200 ${
          isSidebarPinned ? 'ml-64' : 'ml-[68px]'
        }`}
      >
        <TopNav
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenBilling={() => openPage('GSTInvoices', 'GST Billing')}
          notifications={notifications}
          onMarkNotificationsRead={markNotificationsRead}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        />

        <BrowserTabs
          tabs={openTabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          closeTab={closeTab}
        />

        <div className="flex-1 w-full p-6">
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
          />
        )}
        {activeTab === 'PendingActions' && (
          <PendingActions
            items={items}
            customers={customers}
            onPayCustomerBalance={handlePayCustomerBalance}
            openPage={openPage}
          />
        )}
          {activeTab === 'Warehouse' && (
            <Warehouse items={items} setItems={setItems} openPage={openPage} />
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