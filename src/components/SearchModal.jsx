// src/components/SearchModal.jsx
import { useState, useMemo } from 'react';
import {
  Search,
  X,
  FileText,
  ChevronRight,
  ArrowUpDown,
  CornerDownLeft,
  Package,
  Receipt,
} from 'lucide-react';

const tracksStock = (item) => item.stockTracked !== false && item.stockTracked !== 0;

export default function SearchModal({ isOpen, onClose, openPage, items = [], sales = [] }) {
  const [query, setQuery] = useState('');

  const quickActions = [
    { id: 'Dashboard', title: 'Overview', subtitle: 'Dashboard' },
    { id: 'TodaySales', title: 'Revenue & Audit Workspace', subtitle: 'Dashboard' },
    { id: 'PendingActions', title: 'Pending Actions', subtitle: 'Dashboard' },
    { id: 'Inventory', title: 'Manage Raw Materials & Stock', subtitle: 'Inventory & Stock' },
    { id: 'GSTInvoices', title: 'Create WhatsApp GST Invoice', subtitle: 'GST Billing' },
  ];

  // Filter pages, inventory items, and sales based on search query
  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickActions;
    return quickActions.filter((p) =>
      `${p.title} ${p.subtitle}`.toLowerCase().includes(q)
    );
  }, [query]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((i) => `${i.name} ${i.sku} ${i.category}`.toLowerCase().includes(q))
      .slice(0, 4);
  }, [query, items]);

  const filteredSales = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return sales
      .filter((s) =>
        `${s.invoiceNo} ${s.customerName} ${s.customerPhone}`.toLowerCase().includes(q)
      )
      .slice(0, 3);
  }, [query, sales]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/20 backdrop-blur-xs z-50 flex items-start justify-center pt-20"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[720px] bg-white rounded-2xl shadow-2xl border border-gray-200/70 overflow-hidden flex flex-col"
      >
        {/* Search header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
            <Search size={15} /> Search
          </div>
          <div className="flex items-center gap-3">
            <kbd className="border border-gray-200 rounded-md px-2 py-0.5 text-[11px] font-medium text-gray-400">
              Ctrl+K
            </kbd>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        <>
            {/* Search Input Box */}
            <div className="p-6 pb-3">
              <div className="flex items-center border border-blue-300 rounded-xl px-4 py-3 bg-white shadow-2xs">
                <Search size={18} className="text-gray-400 mr-3 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to search pages, raw materials (gum, sheets, ink), invoices..."
                  className="w-full text-sm text-gray-800 outline-none bg-transparent"
                />
                <span className="text-xs font-medium text-gray-400 border border-gray-200 rounded-md px-2.5 py-1 shrink-0">
                  ESC
                </span>
              </div>
            </div>

            {/* Results List */}
            <div className="px-6 pb-4 max-h-[380px] overflow-y-auto space-y-3">
              {/* Pages / Quick Actions */}
              {filteredPages.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                    Quick Actions
                  </p>
                  {filteredPages.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        openPage(item.id, item.title);
                        onClose();
                      }}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-blue-50/60 transition-colors text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 group-hover:bg-white flex items-center justify-center text-gray-500 border border-gray-100 shadow-2xs">
                          <FileText size={17} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">{item.title}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{item.subtitle}</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500" />
                    </button>
                  ))}
                </div>
              )}

              {/* Matching Raw Materials */}
              {filteredItems.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                    Matching Studio Materials
                  </p>
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        openPage('Inventory', 'Inventory');
                        onClose();
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-blue-50/60 transition-colors text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                          <Package size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">{item.name}</p>
                          <p className="text-[11px] text-gray-400">
                            SKU: {item.sku} · ₹{item.price}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                          !tracksStock(item)
                            ? 'bg-gray-100 text-gray-500'
                            : item.stock <= item.minStock
                              ? 'bg-red-50 text-red-600'
                              : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {tracksStock(item)
                          ? `${item.stock} ${item.baseUnit || 'Pieces'} in stock`
                          : 'Not tracked'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Matching Invoices */}
              {filteredSales.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                    Matching GST Invoices
                  </p>
                  {filteredSales.map((sale) => (
                    <button
                      key={sale.invoiceNo}
                      onClick={() => {
                        openPage('TodaySales', 'Revenue & Audit');
                        onClose();
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-blue-50/60 transition-colors text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                          <Receipt size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">{sale.invoiceNo}</p>
                          <p className="text-[11px] text-gray-400">{sale.customerName}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-indigo-600">
                        ₹{(sale.grandTotal || sale.total || 0).toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
        </>

        {/* Footer Bar */}
        <div className="px-6 py-3.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <ArrowUpDown size={13} /> Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <CornerDownLeft size={13} /> Select
            </span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}