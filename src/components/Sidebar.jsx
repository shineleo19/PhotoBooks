// src/components/Sidebar.jsx
import { useState } from 'react';
import {
  LayoutDashboard,
  LayoutGrid,
  Boxes,
  ShelvingUnit,
  PackageOpen,
  Calendar,
  ClockAlert,
  Package,
  FileText,
  Warehouse,
  ChevronDown,
  PanelLeft,
  FilePlus2,
  History,
} from 'lucide-react';

export default function Sidebar({
  isPinned,
  setIsPinned,
  isHovered,
  setIsHovered,
  activeTab,
  openPage,
}) {
  const [dashMenuOpen, setDashMenuOpen] = useState(true);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false); // Expanded by default for Billing & History
  const isExpanded = isPinned || isHovered;

  const isBillingActive = ['GSTInvoices', 'BillingHistory'].includes(activeTab);

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`h-screen fixed left-0 top-0 bg-white border-r border-gray-200/80 flex flex-col z-40 transition-all duration-200 ${
        isExpanded ? 'w-64' : 'w-[68px]'
      } ${!isPinned && isHovered ? 'shadow-2xl' : ''}`}
    >
      {/* Top Brand Header */}
      <div className="h-[68px] px-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
          <img src="/logo.jpg" alt="Photo Books Logo" className="h-10 w-auto rounded-md" />
          {isExpanded && (
            <span className="text-xl font-bold bg-blue-500 bg-clip-text text-transparent">
              PHOTO BOOKS
            </span>
          )}
        </div>

        {isExpanded && (
          <button
            onClick={() => setIsPinned(!isPinned)}
            title={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
            className={`p-1.5 rounded-lg hover:bg-gray-100 transition-colors ${
              isPinned ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400'
            }`}
          >
            <PanelLeft size={18} />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-2.5 overflow-y-auto overflow-x-hidden">
        {/* Main Dashboard Group */}
        <div>
          <button
            onClick={() =>
              isExpanded ? setDashMenuOpen(!dashMenuOpen) : openPage('Dashboard', 'Dashboard')
            }
            className={`w-full flex items-center ${
              isExpanded ? 'justify-between px-3 py-2.5' : 'justify-center h-11 w-11 mx-auto'
            } rounded-xl text-[15px] font-semibold transition-colors ${
              ['Dashboard', 'TodaySales', 'PendingActions'].includes(activeTab)
                ? 'bg-[#e0e7ff] text-indigo-600'
                : 'text-gray-800 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <LayoutDashboard size={20} className=" shrink-0" />
              {isExpanded && <span>Dashboard</span>}
            </div>
            {isExpanded && (
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${
                  dashMenuOpen ? 'rotate-0' : '-rotate-90'
                }`}
              />
            )}
          </button>

          {/* Sub-items when expanded */}
          {isExpanded && dashMenuOpen && (
            <div className="mt-1.5 ml-4 pl-3 border-l border-gray-100 space-y-1">
              <button
                onClick={() => openPage('Dashboard', 'Dashboard')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === 'Dashboard'
                    ? 'bg-[#eef2ff] text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LayoutGrid size={17} />
                <span>Overview</span>
              </button>

              <button
                onClick={() => openPage('TodaySales', 'Revenue & Audit')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === 'TodaySales'
                    ? 'bg-[#eef2ff] text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Calendar size={17} />
                <span>Revenue & Audit</span>
              </button>

              <button
                onClick={() => openPage('PendingActions', 'Pending Actions')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === 'PendingActions'
                    ? 'bg-[#eef2ff] text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ClockAlert size={17} />
                <span>Pending Amount & Actions</span>
              </button>
            </div>
          )}
        </div>

        {/* Inventory Group */}
        <div>
          <button
            onClick={() =>
              isExpanded
                ? setInventoryOpen(!inventoryOpen)
                : openPage('InventoryOverview', 'Inventory Overview')
            }
            className={`w-full flex items-center ${
              isExpanded ? 'justify-between px-3 py-3' : 'justify-center h-11 w-11 mx-auto'
            } rounded-xl text-sm font-medium transition-colors ${
              ['Inventory', 'InventoryOverview', 'InventoryManagement', 'StockManagement'].includes(
                activeTab
              )
                ? 'bg-[#eef2ff] text-indigo-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <Package size={20} className="shrink-0" />
              {isExpanded && <span>Inventory & Stock</span>}
            </div>
            {isExpanded && (
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${
                  inventoryOpen ? 'rotate-0' : '-rotate-90'
                }`}
              />
            )}
          </button>

          {isExpanded && inventoryOpen && (
            <div className="mt-1.5 ml-4 pl-3 border-l border-gray-100 space-y-1">
              <button
                onClick={() => openPage('InventoryOverview', 'Inventory Overview')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === 'InventoryOverview'
                    ? 'bg-[#eef2ff] text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Boxes size={17} />
                <span>Inventory Overview</span>
              </button>

              <button
                onClick={() => openPage('InventoryManagement', 'Inventory Management')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === 'InventoryManagement'
                    ? 'bg-[#eef2ff] text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ShelvingUnit size={17} />
                <span>Inventory Management</span>
              </button>

              <button
                onClick={() => openPage('StockManagement', 'Stock Management')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === 'StockManagement'
                    ? 'bg-[#eef2ff] text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <PackageOpen size={17} />
                <span>Stock Management</span>
              </button>
            </div>
          )}
        </div>

        {/* Expandable Billing & History Group */}
        <div>
          <button
            onClick={() => {
              if (!isExpanded) {
                openPage('GSTInvoices', 'GST Invoices');
              } else {
                setBillingOpen(!billingOpen);
              }
            }}
            className={`w-full flex items-center ${
              isExpanded ? 'justify-between px-3 py-3' : 'justify-center h-11 w-11 mx-auto'
            } rounded-xl text-sm font-medium transition-colors ${
              isBillingActive
                ? 'bg-[#eef2ff] text-indigo-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <FileText size={20} className="shrink-0" />
              {isExpanded && <span>GST Billing</span>}
            </div>
            {isExpanded && (
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${
                  billingOpen ? 'rotate-0' : '-rotate-90'
                }`}
              />
            )}
          </button>

          {isExpanded && billingOpen && (
            <div className="mt-1.5 ml-4 pl-3 border-l border-gray-100 space-y-1">
              <button
                onClick={() => openPage('GSTInvoices', 'New Bill / POS')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === 'GSTInvoices'
                    ? 'bg-[#eef2ff] text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FilePlus2 size={17} />
                <span>New Bill / POS</span>
              </button>

              <button
                onClick={() => openPage('BillingHistory', 'Billing History')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === 'BillingHistory'
                    ? 'bg-[#eef2ff] text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <History size={17} />
                <span>Billing History</span>
              </button>
            </div>
          )}
        </div>

        {/* Warehouse */}
        <button
          onClick={() => openPage('Warehouse', 'Warehouse')}
          className={`w-full flex items-center ${
            isExpanded ? 'justify-between px-3 py-3' : 'justify-center h-11 w-11 mx-auto'
          } rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'Warehouse'
              ? 'bg-[#eef2ff] text-indigo-600'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <Warehouse size={20} className="shrink-0 " />
            {isExpanded && <span>Warehouse</span>}
          </div>
        </button>
      </nav>
    </aside>
  );
}