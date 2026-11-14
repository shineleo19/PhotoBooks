// src/components/PendingActions.jsx
import { Fragment, useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../api';
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
  Upload,
  Edit,
  Save,
  X,
} from 'lucide-react';
import { rankCustomers } from '../utils/itemSearch';

const tracksStock = (item) => item.stockTracked !== false && item.stockTracked !== 0;

export default function PendingActions({
  items = [],
  customers = [],
  onPayCustomerBalance,
  onCustomersImported,
  openPage,
  initialSection = 'balances',
  onNotify,
}) {
  const [activeSection, setActiveSection] = useState(initialSection); // 'balances' | 'customers' | 'stock'
  const [search, setSearch] = useState('');
  const [paymentInputs, setPaymentInputs] = useState({});
  const [submittingCustomerId, setSubmittingCustomerId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [customerLedger, setCustomerLedger] = useState({});
  const [loadingLedgerId, setLoadingLedgerId] = useState(null);
  const customerFileInputRef = useRef(null);
  const [customerImportPreview, setCustomerImportPreview] = useState(null);
  const [customerImportAction, setCustomerImportAction] = useState('skip');
  const [customerImporting, setCustomerImporting] = useState(false);
  const [customerImportResult, setCustomerImportResult] = useState(null);
  const [editingPlaceCustomerId, setEditingPlaceCustomerId] = useState(null);
  const [editingPlace, setEditingPlace] = useState('');
  const [savingPlaceCustomerId, setSavingPlaceCustomerId] = useState(null);

  const toggleCustomerLedger = async (customer) => {
    if (expandedCustomerId === customer.id) {
      setExpandedCustomerId(null);
      return;
    }

    setExpandedCustomerId(customer.id);
    if (customerLedger[customer.id]) return;

    setLoadingLedgerId(customer.id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/customers/${customer.id}/ledger`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load customer ledger.');
      setCustomerLedger((current) => ({ ...current, [customer.id]: data }));
    } catch (err) {
      setStatusMessage(`error:${err.message}`);
      onNotify?.('Customer ledger failed', err.message, 'warning');
    } finally {
      setLoadingLedgerId(null);
    }
  };

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
    return rankCustomers(customers, search);
  }, [customers, search]);

  const normalizePhone = (phone) => {
    let cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    return cleanPhone;
  };

  const handleCustomerFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const firstRow = rows[0] || {};
        const hasOpeningBalance = Object.keys(firstRow).some((key) =>
          String(key).trim().toLowerCase().replace(/[\s_-]+/g, '') === 'openingbalance'
        );
        const getValue = (row, names) => {
          const key = Object.keys(row).find((candidate) =>
            names.includes(String(candidate).trim().toLowerCase())
          );
          return key ? row[key] : '';
        };
        const parsedRows = rows.map((row) => ({
            name: String(getValue(row, ['name', 'customer name', 'customer']) || '').trim(),
            phone: String(getValue(row, ['phone', 'phone number', 'mobile', 'mobile number']) || '').trim(),
            place: String(getValue(row, ['place', 'address', 'town']) || '').trim(),
          }));
        const parsedCustomers = parsedRows.filter((customer) => customer.name);

        const existingByPhone = new Map();
        const existingByName = new Map();
        customers.forEach((customer) => {
          const phone = normalizePhone(customer.phone);
          if (phone) existingByPhone.set(phone, customer);
          existingByName.set(customer.name.trim().toLowerCase(), customer);
        });
        const newCustomers = [];
        const existingCustomers = [];
        const seenPhones = new Set();
        const seenNames = new Set();
        parsedCustomers.forEach((customer) => {
          const phone = normalizePhone(customer.phone);
          const nameKey = customer.name.toLowerCase();
          const match = phone ? existingByPhone.get(phone) : existingByName.get(nameKey);
          const duplicateInFile = phone ? seenPhones.has(phone) : seenNames.has(nameKey);
          if (phone) seenPhones.add(phone);
          seenNames.add(nameKey);
          (match || duplicateInFile ? existingCustomers : newCustomers).push({
            ...customer,
            existingCustomer: match || null,
          });
        });

        if (!parsedCustomers.length) {
          onNotify?.('Customer import failed', 'A Name column with at least one value is required.', 'warning');
          return;
        }
        setCustomerImportResult(null);
        setCustomerImportAction('skip');
        setCustomerImportPreview({
          totalRows: parsedRows.length,
          rows: parsedRows,
          newCustomers,
          existingCustomers,
          hasOpeningBalance,
        });
      } catch (error) {
        console.error('Customer import parsing failed:', error);
        onNotify?.('Customer import failed', 'Could not read the selected spreadsheet.', 'warning');
      }
    };
    reader.onerror = () => {
      console.error('Customer import file read failed:', reader.error);
      onNotify?.('Customer import failed', 'Could not read the selected file.', 'warning');
    };
    reader.readAsArrayBuffer(file);
    event.target.value = null;
  };

  const confirmCustomerImport = async () => {
    if (!customerImportPreview || customerImporting) return;
    setCustomerImporting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/customers/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customers: customerImportPreview.rows,
          action: customerImportAction,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Customer import failed.');
      setCustomerImportResult(data);
      if (Array.isArray(data.customers)) {
        onCustomersImported?.(data.customers);
        onNotify?.('Customer import complete', `${data.importedCustomers} imported, ${data.updatedCustomers} updated.`, 'info');
      }
    } catch (error) {
      setCustomerImportResult({
        importedCustomers: 0,
        updatedCustomers: 0,
        skippedCustomers: 0,
        failedRows: customerImportPreview.totalRows,
      });
      onNotify?.('Customer import failed', error.message, 'warning');
    } finally {
      setCustomerImporting(false);
    }
  };

  const startEditingPlace = (event, customer) => {
    event.stopPropagation();
    setEditingPlaceCustomerId(customer.id);
    setEditingPlace(customer.place || '');
  };

  const cancelEditingPlace = (event) => {
    event.stopPropagation();
    setEditingPlaceCustomerId(null);
    setEditingPlace('');
  };

  const saveCustomerPlace = async (event, customer) => {
    event.stopPropagation();
    setSavingPlaceCustomerId(customer.id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/customers/${customer.id}/place`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place: editingPlace }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update customer place.');
      }

      onCustomersImported?.(
        customers.map((current) => (current.id === customer.id ? data.customer : current))
      );
      setEditingPlaceCustomerId(null);
      setEditingPlace('');
      onNotify?.('Customer updated', 'Customer place saved successfully.', 'info');
    } catch (error) {
      onNotify?.('Customer update failed', error.message, 'warning');
    } finally {
      setSavingPlaceCustomerId(null);
    }
  };

  // 3. Low Stock Items
  const lowStockItems = useMemo(() => {
    return items.filter((i) => tracksStock(i) && i.stock <= i.minStock);
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
      onNotify?.(
        'Payment failed',
        result?.error || 'Failed to update customer balance.',
        'warning'
      );
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
            <div>
              <input
                ref={customerFileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleCustomerFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => customerFileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <Upload size={16} /> Import Customers
              </button>
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
                    <Fragment key={cust.id}>
                      <tr
                        onClick={() => toggleCustomerLedger(cust)}
                        className="hover:bg-gray-50/70 cursor-pointer"
                      >
                      <td className="p-4 text-gray-400 text-xs">{index + 1}</td>
                      <td className="p-4 font-bold text-gray-900">
                        {cust.name}
                        <span className="block text-[10px] font-normal text-indigo-500">
                          {expandedCustomerId === cust.id ? 'Hide transactions' : 'View transactions'}
                        </span>
                      </td>
                      <td className="p-4 text-indigo-700 font-semibold text-xs">
                        {editingPlaceCustomerId === cust.id ? (
                          <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                            <input
                              value={editingPlace}
                              onChange={(event) => setEditingPlace(event.target.value)}
                              autoFocus
                              placeholder="Enter place"
                              className="w-32 rounded-md border border-indigo-300 px-2 py-1 text-xs font-normal text-gray-800 outline-none"
                            />
                            <button
                              type="button"
                              onClick={(event) => saveCustomerPlace(event, cust)}
                              disabled={savingPlaceCustomerId === cust.id}
                              title="Save place"
                              className="text-emerald-600 hover:text-emerald-700 disabled:text-gray-300 cursor-pointer"
                            >
                              <Save size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingPlace}
                              disabled={savingPlaceCustomerId === cust.id}
                              title="Cancel"
                              className="text-gray-400 hover:text-gray-600 disabled:text-gray-300 cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {cust.place ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50">
                                <MapPin size={12} /> {cust.place}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                            <button
                              type="button"
                              onClick={(event) => startEditingPlace(event, cust)}
                              title="Edit place"
                              className="text-gray-400 hover:text-indigo-600 cursor-pointer"
                            >
                              <Edit size={13} />
                            </button>
                          </div>
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
                            onClick={(event) => {
                              event.stopPropagation();
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
                      {expandedCustomerId === cust.id && (
                        <tr className="bg-gray-50/70">
                        <td colSpan="8" className="px-6 py-4">
                          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-100">
                              <p className="text-sm font-bold text-gray-900">
                                {cust.name} transaction history
                              </p>
                              <p className="text-xs text-gray-500">
                                Billed amounts are red; received payments are green.
                              </p>
                            </div>
                            {loadingLedgerId === cust.id ? (
                              <p className="p-4 text-xs text-gray-500">Loading transactions...</p>
                            ) : (customerLedger[cust.id] || []).length === 0 ? (
                              <p className="p-4 text-xs text-gray-500">No transactions recorded yet.</p>
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {customerLedger[cust.id].map((entry) => (
                                  <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                                    <div>
                                      <p className="text-xs font-semibold text-gray-800">
                                        {entry.type === 'billed' ? `Billed #${entry.reference}` : entry.reference}
                                      </p>
                                      <p className="text-[11px] text-gray-500">
                                        {new Date(entry.occurredAt).toLocaleString('en-IN')}
                                      </p>
                                    </div>
                                    <span className={`font-bold ${entry.amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                      {entry.amount < 0 ? '-' : '+'}₹{Math.abs(entry.amount).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        </tr>
                      )}
                    </Fragment>
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
      {customerImportPreview && (
        <CustomerImportDialog
          preview={customerImportPreview}
          action={customerImportAction}
          setAction={setCustomerImportAction}
          importing={customerImporting}
          result={customerImportResult}
          onConfirm={confirmCustomerImport}
          onClose={() => {
            if (!customerImporting) {
              setCustomerImportPreview(null);
              setCustomerImportResult(null);
            }
          }}
        />
      )}
    </div>
  );
}

function CustomerImportDialog({
  preview,
  action,
  setAction,
  importing,
  result,
  onConfirm,
  onClose,
}) {
  const duplicatePreview = preview.existingCustomers.slice(0, 5);
  const resultShown = result && typeof result.importedCustomers === 'number';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900">
          {resultShown ? 'Customer import complete' : 'Review customer import'}
        </h3>
        {!resultShown ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ['Total Rows', preview.totalRows],
                ['New Customers', preview.newCustomers.length],
                ['Existing Customers', preview.existingCustomers.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            {preview.hasOpeningBalance && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Opening Balance import is not currently supported because customer balances are derived from sales and payment history.
              </p>
            )}
            {duplicatePreview.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold text-gray-800">Duplicate preview</p>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="p-3">Customer</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicatePreview.map((customer, index) => (
                        <tr key={`${customer.name}-${customer.phone}-${index}`} className="border-t border-gray-100">
                          <td className="p-3">{customer.name}</td>
                          <td className="p-3">{customer.phone || 'N/A'}</td>
                          <td className="p-3">Existing</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="mt-5 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Existing customer action</p>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" checked={action === 'skip'} onChange={() => setAction('skip')} />
                Skip Existing Customers
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" checked={action === 'update'} onChange={() => setAction('update')} />
                Update Existing Customers
              </label>
            </div>
          </>
        ) : (
          <div className="mt-5 space-y-2 text-sm text-gray-700">
            <p>Imported Customers: {result.importedCustomers}</p>
            <p>Updated Customers: {result.updatedCustomers}</p>
            <p>Skipped Customers: {result.skippedCustomers}</p>
            <p>Failed Rows: {result.failedRows}</p>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={importing} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700">
            {resultShown ? 'Close' : 'Cancel'}
          </button>
          {!resultShown && (
            <button type="button" onClick={onConfirm} disabled={importing} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300">
              {importing ? 'Importing...' : 'Import Customers'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}