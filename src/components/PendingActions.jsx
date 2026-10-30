// src/components/PendingActions.jsx
import { useState, useMemo } from 'react';
import {
  Wallet,
  Users,
  AlertTriangle,
  CheckCircle2,
  Search,
  IndianRupee,
  ArrowRight,
  Phone,
  MapPin,
  FileText,
} from 'lucide-react';

export default function PendingActions({
  items = [],
  customers = [],
  onPayCustomerBalance,
  openPage,
}) {
  const [activeSection, setActiveSection] = useState('balances'); // 'balances' | 'customers' | 'stock'
  const [search, setSearch] = useState('');
  const [paymentInputs, setPaymentInputs] = useState({});
  const [submittingCustomerId, setSubmittingCustomerId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // 1. Customers with Pending Amount > 0 ("This person has this pending amount")
  const customersWithPending = useMemo(() => {
    const list = customers.filter((c) => Number(c.balance || 0) > 0);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      `${c.name} ${c.place || ''} ${c.phone}`.toLowerCase().includes(q)
    );
  }, [customers, search]);

  // 2. All Customers Table
  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      `${c.name} ${c.place || ''} ${c.phone} ${c.lastInvoiceNo}`.toLowerCase().includes(q)
    );
  }, [customers, search]);

  // 3. Low Stock Items
  const lowStockItems = useMemo(() => {
    return items.filter((i) => i.stock <= i.minStock);
  }, [items]);

  const totalPendingBalance = useMemo(() => {
    return customers.reduce((sum, c) => sum + Number(c.balance || 0), 0);
  }, [customers]);

  const handlePaymentInputChange = (customerId, val, maxBalance) => {
    if (val === '') {
      setPaymentInputs((prev) => ({ ...prev, [customerId]: '' }));
      return;
    }
    const num = Number(val);
    if (isNaN(num)) return;
    const clamped = Math.min(maxBalance, Math.max(0, num));
    setPaymentInputs((prev) => ({ ...prev, [customerId]: clamped }));
  };

  const handleCollectCustomerPayment = async (customer) => {
    const maxBal = Number(customer.balance || 0);
    const entered =
      paymentInputs[customer.id] !== undefined && paymentInputs[customer.id] !== ''
        ? Number(paymentInputs[customer.id])
        : maxBal;

    if (entered <= 0 || entered > maxBal) return;

    setSubmittingCustomerId(customer.id);
    setStatusMessage('');

    const result = await onPayCustomerBalance(customer.id, entered);
    if (result?.success) {
      setStatusMessage(`success:${result.message}`);
      setPaymentInputs((prev) => {
        const next = { ...prev };
        delete next[customer.id];
        return next;
      });
    } else {
      setStatusMessage(`error:${result?.error || 'Failed to update customer balance.'}`);
    }
    setSubmittingCustomerId(null);
  };

  return (
    <div className="w-full space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setActiveSection('balances')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeSection === 'balances'
              ? 'bg-amber-50/70 border-amber-300 shadow-xs'
              : 'bg-white border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Total Pending Amount
            </span>
            <Wallet size={18} className="text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">
            ₹{totalPendingBalance.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            From {customersWithPending.length} customers with pending balance
          </p>
        </div>

        <div
          onClick={() => setActiveSection('customers')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeSection === 'customers'
              ? 'bg-indigo-50/70 border-indigo-300 shadow-xs'
              : 'bg-white border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
              Customer Database Table
            </span>
            <Users size={18} className="text-indigo-600" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{customers.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            Saved customers with place & pending history
          </p>
        </div>

        <div
          onClick={() => setActiveSection('stock')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeSection === 'stock'
              ? 'bg-red-50/70 border-red-300 shadow-xs'
              : 'bg-white border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-600">
              Low Stock Alerts
            </span>
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{lowStockItems.length}</p>
          <p className="text-xs text-gray-500 mt-1">Items below minimum stock threshold</p>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Search Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSection('balances')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'balances'
                ? 'bg-white text-amber-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Wallet size={14} />
            Collect Pending Amount ({customersWithPending.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('customers')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'customers'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users size={14} />
            Customers Table ({customers.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('stock')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'stock'
                ? 'bg-white text-red-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <AlertTriangle size={14} />
            Low Stock ({lowStockItems.length})
          </button>
        </div>

        {activeSection !== 'stock' && (
          <div className="flex items-center rounded-xl border border-gray-200 bg-[#f8f9fb] px-3.5 py-2 sm:w-72">
            <Search size={16} className="text-gray-400 mr-2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer name, place, phone..."
              className="bg-transparent text-sm outline-none w-full text-gray-800"
            />
          </div>
        )}
      </div>

      {/* Status Notification Banner */}
      {statusMessage && (
        <div
          className={`px-5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
            statusMessage.startsWith('error:')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          <span>{statusMessage.replace(/^(error:|success:)/, '')}</span>
          <button
            type="button"
            onClick={() => setStatusMessage('')}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: PERSON-WISE PENDING AMOUNT COLLECTION */}
      {activeSection === 'balances' && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Wallet size={18} className="text-amber-600" /> Customer Pending Balances
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Each customer&apos;s total pending amount is shown below. Enter the amount they pay to update their balance.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500">
                  <th className="p-4">Customer & Place</th>
                  <th className="p-4">Pending Summary</th>
                  <th className="p-4 text-right">Total Billed</th>
                  <th className="p-4 text-right">Total Paid</th>
                  <th className="p-4 text-right">Pending Amount</th>
                  <th className="p-4 text-center">Enter Amount Paid Now</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {customersWithPending.map((cust) => {
                  const totalBilled = Number(cust.totalBilled || 0);
                  const totalPaid = Number(cust.totalPaid || 0);
                  const balance = Number(cust.balance || 0);
                  const currentInput =
                    paymentInputs[cust.id] !== undefined ? paymentInputs[cust.id] : '';

                  return (
                    <tr key={cust.id} className="hover:bg-amber-50/20">
                      <td className="p-4">
                        <p className="font-bold text-gray-900">
                          {cust.name}
                          {cust.place && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold">
                              <MapPin size={11} /> {cust.place}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {cust.phone.startsWith('NAME:') ? 'No phone' : `+${cust.phone}`}
                        </p>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl inline-block">
                          <strong>
                            {cust.name} {cust.place ? `(${cust.place})` : ''}
                          </strong>{' '}
                          has <strong>₹{balance.toFixed(2)}</strong> pending
                        </span>
                      </td>
                      <td className="p-4 text-right font-medium text-gray-800">
                        ₹{totalBilled.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-semibold text-emerald-600">
                        ₹{totalPaid.toFixed(2)}
                      </td>
                      <td className="p-4 text-right">
                        <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-extrabold">
                          ₹{balance.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center">
                          <div className="flex items-center rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 w-36 focus-within:border-indigo-600">
                            <IndianRupee size={13} className="text-gray-400 mr-1" />
                            <input
                              type="number"
                              min="1"
                              max={balance}
                              step="0.01"
                              placeholder={`Max ₹${balance}`}
                              value={currentInput}
                              onChange={(e) =>
                                handlePaymentInputChange(cust.id, e.target.value, balance)
                              }
                              className="w-full text-sm font-bold text-gray-900 outline-none bg-transparent"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          disabled={
                            submittingCustomerId === cust.id ||
                            (currentInput !== '' && Number(currentInput) <= 0)
                          }
                          onClick={() => handleCollectCustomerPayment(cust)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          <CheckCircle2 size={14} />
                          {submittingCustomerId === cust.id
                            ? 'Updating...'
                            : currentInput
                              ? `Receive ₹${currentInput}`
                              : 'Receive Full'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {customersWithPending.length === 0 && (
              <div className="py-14 text-center text-gray-400 text-sm flex flex-col items-center">
                <CheckCircle2 size={32} className="mb-2 text-emerald-400" />
                All customers have settled their bills! No pending balances due.
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 2: DEDICATED CUSTOMER TABLE */}
      {activeSection === 'customers' && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Users size={18} className="text-indigo-600" /> Customer Database Table
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Dedicated SQLite Customer table storing Customer Name, Place, Phone, and Pending Amount.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500">
                  <th className="p-4">#</th>
                  <th className="p-4">Customer Name</th>
                  <th className="p-4">Place / Town</th>
                  <th className="p-4">WhatsApp Phone</th>
                  <th className="p-4">Last Estimate</th>
                  <th className="p-4 text-right">Total Billed</th>
                  <th className="p-4 text-right">Total Paid</th>
                  <th className="p-4 text-right">Pending Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredCustomers.map((cust, index) => {
                  const bal = Number(cust.balance || 0);
                  const cleanPhoneDisplay = cust.phone.startsWith('NAME:')
                    ? 'N/A'
                    : `+${cust.phone}`;

                  return (
                    <tr key={cust.id} className="hover:bg-gray-50/70">
                      <td className="p-4 text-gray-400 text-xs">{index + 1}</td>
                      <td className="p-4 font-bold text-gray-900">{cust.name}</td>
                      <td className="p-4 text-indigo-700 font-semibold text-xs">
                        {cust.place ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50">
                            <MapPin size={12} /> {cust.place}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-gray-600 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} className="text-gray-400" /> {cleanPhoneDisplay}
                        </span>
                      </td>
                      <td className="p-4 text-indigo-600 font-semibold text-xs">
                        {cust.lastInvoiceNo ? (
                          <span className="inline-flex items-center gap-1">
                            <FileText size={12} /> #{cust.lastInvoiceNo}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-right font-semibold text-gray-900">
                        ₹{Number(cust.totalBilled || 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-semibold text-emerald-600">
                        ₹{Number(cust.totalPaid || 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-right">
                        {bal > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSearch(cust.name);
                              setActiveSection('balances');
                            }}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-extrabold cursor-pointer"
                          >
                            ₹{bal.toFixed(2)} Pending →
                          </button>
                        ) : (
                          <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold">
                            ₹0.00 (Settled)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredCustomers.length === 0 && (
              <div className="py-14 text-center text-gray-400 text-sm flex flex-col items-center">
                <Users size={32} className="mb-2 text-gray-300" />
                No customer records found yet.
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 3: LOW STOCK MATERIAL ALERTS */}
      {activeSection === 'stock' && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" /> Low Stock Raw Material Alerts
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Items that have dropped at or below their minimum stock threshold.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openPage('StockManagement', 'Stock Management')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
            >
              Restock Inventory <ArrowRight size={14} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500">
                  <th className="p-4">Material Name</th>
                  <th className="p-4">SKU</th>
                  <th className="p-4">Category</th>
                  <th className="p-4 text-center">Current Stock</th>
                  <th className="p-4 text-center">Min Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {lowStockItems.map((item) => (
                  <tr key={item.id}>
                    <td className="p-4 font-semibold text-gray-900">{item.name}</td>
                    <td className="p-4 text-xs text-gray-400">{item.sku}</td>
                    <td className="p-4 text-gray-600">{item.category}</td>
                    <td className="p-4 text-center">
                      <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold">
                        {item.stock} left
                      </span>
                    </td>
                    <td className="p-4 text-center text-gray-500">{item.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {lowStockItems.length === 0 && (
              <div className="py-12 text-center text-gray-400 text-sm">
                All items are well above minimum stock levels.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}