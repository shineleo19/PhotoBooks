// src/components/BrowserTabs.jsx
import { useLayoutEffect, useRef, useState } from 'react';
import {
  X,
  LayoutDashboard,
  ShelvingUnit,
  Calendar,
  ClockAlert,
  ChevronDown,
  MoreHorizontal,
  Boxes,
  FileText,
  PackageOpen,
  Warehouse,
} from 'lucide-react';
import Warehouses from './Warehouse';

export default function BrowserTabs({ tabs, activeTab, setActiveTab, closeTab }) {
  const containerRef = useRef(null);
  const measureRefs = useRef([]);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  useLayoutEffect(() => {
    const measureTabs = () => {
      const containerWidth = containerRef.current?.clientWidth || 0;
      const tabWidths = measureRefs.current.slice(0, tabs.length).map((tab) => tab?.offsetWidth || 0);
      const totalWidth = tabWidths.reduce((sum, width) => sum + width, 0);
      let nextVisibleCount = tabs.length;

      if (containerWidth && totalWidth > containerWidth) {
        const overflowButtonWidth = 48;
        let usedWidth = 0;
        nextVisibleCount = 0;

        for (const tabWidth of tabWidths) {
          if (usedWidth + tabWidth + overflowButtonWidth > containerWidth) break;
          usedWidth += tabWidth;
          nextVisibleCount += 1;
        }

        nextVisibleCount = Math.max(nextVisibleCount, 1);
      }

      setVisibleCount((currentCount) => currentCount === nextVisibleCount ? currentCount : nextVisibleCount);
    };

    measureTabs();
    const observer = new ResizeObserver(measureTabs);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [tabs]);

  const visibleTabs = tabs.slice(0, visibleCount);
  const overflowTabs = tabs.slice(visibleCount);

  const getIcon = (id) => {
    switch (id) {
      case 'Dashboard':
        return <LayoutDashboard size={17} />;
      case 'TodaySales':
        return <Calendar size={17} />;
      case 'Inventory':
      case 'InventoryOverview':
        return <Boxes size={17} />;
      case 'InventoryManagement':
        return <ShelvingUnit size={17} />;
      case 'StockManagement':
        return <PackageOpen size={17} />;
      case 'GSTInvoices':
        return <FileText size={17} />;
      case 'PendingActions':
        return <ClockAlert   size={17} />;
      default:
        return <Warehouse size={17} />;
    }
  };

  return (
    <div ref={containerRef} className="relative flex h-[50px] w-full items-center overflow-visible border-b border-gray-200 bg-white">
      <div className="pointer-events-none absolute left-0 top-0 flex h-0 invisible whitespace-nowrap" aria-hidden="true">
        {tabs.map((tab, index) => (
          <div
            key={`measure-${tab.id}`}
            ref={(element) => { measureRefs.current[index] = element; }}
            className="group flex h-[50px] items-center gap-2.5 border-r border-gray-200 px-6 text-[15px] whitespace-nowrap"
          >
            <span>{getIcon(tab.id)}</span>
            <span>{tab.name}</span>
            {tab.id !== 'Dashboard' && <span className="ml-2 p-0.5"><X size={14} /></span>}
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
      {visibleTabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group h-full flex items-center gap-2.5 px-6 border-r border-gray-200 cursor-pointer text-[15px] whitespace-nowrap transition-colors relative ${
              isActive
                ? 'text-[#2563eb] font-semibold bg-blue-50/10 border-b-[2.5px] border-b-[#2563eb]'
                : 'text-gray-700 font-medium hover:bg-gray-50'
            }`}
          >
            <span className={isActive ? 'text-[#2563eb]' : 'text-gray-400'}>
              {getIcon(tab.id)}
            </span>
            <span>{tab.name}</span>

            {tab.id !== 'Dashboard' && (
              <button
                onClick={(e) => closeTab(tab.id, e)}
                className="ml-2 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
      </div>

      {overflowTabs.length > 0 && (
        <div className="relative shrink-0 border-l border-gray-200">
          <button
            onClick={() => setIsOverflowOpen((open) => !open)}
            aria-label={`${overflowTabs.length} more tabs`}
            title={`${overflowTabs.length} more tabs`}
            className={`flex h-[50px] items-center gap-1 px-3 text-gray-500 hover:bg-gray-50 ${overflowTabs.some((tab) => tab.id === activeTab) ? 'text-[#2563eb]' : ''}`}
          >
            <MoreHorizontal size={18} />
            <ChevronDown size={14} />
          </button>

          {isOverflowOpen && (
            <div className="absolute right-0 top-[52px] z-50 min-w-[220px] rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
              {overflowTabs.map((tab) => (
                <div key={tab.id} className="flex items-center rounded-lg hover:bg-gray-50">
                  <button
                    onClick={() => { setActiveTab(tab.id); setIsOverflowOpen(false); }}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm ${activeTab === tab.id ? 'font-semibold text-[#2563eb]' : 'text-gray-700'}`}
                  >
                    <span className="shrink-0">{getIcon(tab.id)}</span>
                    <span className="truncate">{tab.name}</span>
                  </button>
                  {tab.id !== 'Dashboard' && (
                    <button
                      onClick={(event) => closeTab(tab.id, event)}
                      title={`Close ${tab.name}`}
                      className="mr-1 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}