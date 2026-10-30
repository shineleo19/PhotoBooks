// src/components/BillingPOS.jsx
import { useState, useMemo, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../api';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  Receipt,
  Phone,
  User,
  MapPin,
  CheckCircle2,
  Package,
  Eye,
  X,
  FileCheck2,
  QrCode,
  Wifi,
  Download,
  History,
  FilePlus2,
  PlusCircle,
  UserPlus,
} from 'lucide-react';

const numberToIndianWords = (value) => {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigitWords = (number) => {
    if (number < 20) return ones[number];
    return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ''}`;
  };

  const underThousandWords = (number) => {
    const hundreds = Math.floor(number / 100);
    const remainder = number % 100;
    return [
      hundreds ? `${ones[hundreds]} Hundred` : '',
      remainder ? twoDigitWords(remainder) : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  const integer = Math.floor(Math.abs(Number(value) || 0));
  if (integer === 0) return 'Zero';

  const crore = Math.floor(integer / 10000000);
  const lakh = Math.floor((integer % 10000000) / 100000);
  const thousand = Math.floor((integer % 100000) / 1000);
  const remainder = integer % 1000;

  return [
    crore ? `${underThousandWords(crore)} Crore` : '',
    lakh ? `${underThousandWords(lakh)} Lakh` : '',
    thousand ? `${underThousandWords(thousand)} Thousand` : '',
    remainder ? underThousandWords(remainder) : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const amountToIndianWords = (amount) => {
  const roundedAmount = Math.round((Number(amount) || 0) * 100) / 100;
  const rupees = Math.floor(Math.abs(roundedAmount));
  const paise = Math.round((Math.abs(roundedAmount) - rupees) * 100);
  const prefix = roundedAmount < 0 ? 'Minus ' : '';
  const rupeeText = `${prefix}${numberToIndianWords(rupees)}`;

  return paise
    ? `${rupeeText} and ${numberToIndianWords(paise)} Paise Only`
    : `${rupeeText} Only`;
};

const createEstimateNumber = () => {
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sequence = Math.floor(1000 + Math.random() * 9000);
  return `EST-${dateKey}-${sequence}`;
};

export default function BillingPOS({
  items = [],
  setItems,
  sales = [],
  customers = [],
  setCustomers,
  onCompleteBill,
  businessInfo = {},
  initialSubTab = 'pos',
}) {
  const storeName = businessInfo.businessName || 'PHOTO BOOKS';
  const storeGstin = businessInfo.gstin || '33ABEPB960D1Z7';
  const storeAddress =
    businessInfo.address ||
    '10/1.11/1 Parasakthi building upstairs Madrai road, Tirunelveli junction Tirunelveli';
  const storePhone = businessInfo.phone || '8754540404';
  const storeUpiId = businessInfo.upiId || 'photobooks@icici';

  const [subTab, setSubTab] = useState(initialSubTab);
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [cart, setCart] = useState([]);

  // Customer Selection & Autocomplete States
  const [customerName, setCustomerName] = useState('');
  const [customerPlace, setCustomerPlace] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef(null);

  // New Customer Popup Modal States
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    place: '',
    phone: '',
  });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState('');

  // Quick Add Item to DB Modal State (Only asks for Product Price; 18% GST is automatic!)
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    sku: '',
    category: 'Photo Books',
    price: '',
    stock: '100',
    minStock: '10',
  });
  const [isSavingItem, setIsSavingItem] = useState(false);

  const [sendWhatsAppToggle, setSendWhatsAppToggle] = useState(true);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [previewBill, setPreviewBill] = useState(null);
  const [isBillConfirmed, setIsBillConfirmed] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastBill, setLastBill] = useState(null);

  const [waState, setWaState] = useState({ connected: false, qrDataUrl: null });
  const [showWaQrModal, setShowWaQrModal] = useState(false);

  useEffect(() => {
    const checkWaStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/whatsapp-status`);
        if (res.ok) {
          const data = await res.json();
          setWaState(data);
          if (data.connected) setShowWaQrModal(false);
        }
      } catch {
        setWaState({ connected: false, qrDataUrl: null });
      }
    };

    checkWaStatus();
    const timer = setInterval(checkWaStatus, 4000);
    return () => clearInterval(timer);
  }, []);

  // Filter matching customers from DB by name, place, or phone
  const matchingCustomers = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      `${c.name} ${c.place || ''} ${c.phone}`.toLowerCase().includes(q)
    );
  }, [customers, customerName]);

  const exactCustomerMatch = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return true;
    return customers.some((c) => c.name.trim().toLowerCase() === q);
  }, [customers, customerName]);

  const handleSelectExistingCustomer = (cust) => {
    setCustomerName(cust.name);
    setCustomerPlace(cust.place || '');
    const cleanPhone = cust.phone.startsWith('NAME:')
      ? ''
      : cust.phone.replace(/^91(\d{10})$/, '$1');
    setCustomerPhone(cleanPhone);
    setShowCustomerDropdown(false);
  };

  const handleOpenNewCustomerModal = (prefillName = '') => {
    setNewCustomerForm({
      name: prefillName || customerName.trim(),
      place: customerPlace.trim(),
      phone: customerPhone.trim(),
    });
    setCustomerError('');
    setShowCustomerDropdown(false);
    setShowNewCustomerModal(true);
  };

  const handleCreateCustomerInDb = async (e) => {
    e.preventDefault();
    if (
      !newCustomerForm.name.trim() ||
      !newCustomerForm.place.trim() ||
      !newCustomerForm.phone.trim()
    ) {
      setCustomerError('Please enter Customer Name, Place, and WhatsApp Phone Number.');
      return;
    }

    setIsSavingCustomer(true);
    setCustomerError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerForm.name.trim(),
          place: newCustomerForm.place.trim(),
          phone: newCustomerForm.phone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCustomerError(data.error || 'Failed to save customer.');
        return;
      }

      if (setCustomers && Array.isArray(data.customers)) {
        setCustomers(data.customers);
      }
      setCustomerName(data.customer.name);
      setCustomerPlace(data.customer.place || '');
      const displayPhone = data.customer.phone.replace(/^91(\d{10})$/, '$1');
      setCustomerPhone(displayPhone);
      setShowNewCustomerModal(false);
    } catch (err) {
      setCustomerError(err.message);
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Save a new item to DB (Only asks for Product Price; 18% GST is automatic)
  const handleCreateItemInDb = async (e) => {
    e.preventDefault();
    if (!newItemForm.name.trim() || !newItemForm.price) return;

    setIsSavingItem(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItemForm.name.trim(),
          sku: newItemForm.sku.trim() || `PB-${Date.now().toString().slice(-4)}`,
          category: newItemForm.category.trim() || 'General',
          price: Number(newItemForm.price) || 0,
          stock: Number(newItemForm.stock) || 0,
          minStock: Number(newItemForm.minStock) || 5,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        if (setItems) {
          setItems((prev) => [created, ...prev]);
        }
        setNewItemForm({
          name: '',
          sku: '',
          category: 'Photo Books',
          price: '',
          stock: '100',
          minStock: '10',
        });
        setShowAddItemModal(false);
      }
    } finally {
      setIsSavingItem(false);
    }
  };

  const availableItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(q)
    );
  }, [items, search]);

  const filteredSales = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) =>
      `${s.invoiceNo} ${s.customerName} ${s.customerPlace || ''} ${s.customerPhone}`
        .toLowerCase()
        .includes(q)
    );
  }, [sales, historySearch]);

  const addToCart = (product) => {
    if (product.stock <= 0) return;

    setCart((current) => {
      const existing = current.find((c) => c.id === product.id);
      if (existing) {
        if (existing.qty + 1 > product.stock) return current;
        return current.map((c) =>
          c.id === product.id ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [
        ...current,
        {
          ...product,
          price: Number(product.price) || 0,
          qty: 1,
        },
      ];
    });
  };

  const updateQty = (id, delta) => {
    const product = items.find((i) => i.id === id);
    if (!product) return;

    setCart((current) =>
      current
        .map((c) => {
          if (c.id !== id) return c;
          const currentQty = Number(c.qty) || 0;
          const nextQty = currentQty + delta;
          if (nextQty > product.stock) return { ...c, qty: product.stock };
          return { ...c, qty: nextQty };
        })
        .filter((c) => c.qty > 0)
    );
  };

  const setDirectQty = (id, rawValue) => {
    const product = items.find((i) => i.id === id);
    if (!product) return;

    if (rawValue === '') {
      setCart((current) =>
        current.map((c) => (c.id === id ? { ...c, qty: '' } : c))
      );
      return;
    }

    const parsed = parseInt(rawValue, 10);
    if (isNaN(parsed)) return;

    const clampedQty = Math.min(Math.max(1, parsed), product.stock);
    setCart((current) =>
      current.map((c) => (c.id === id ? { ...c, qty: clampedQty } : c))
    );
  };

  const handleQtyBlur = (id) => {
    setCart((current) =>
      current.map((c) => {
        if (c.id !== id) return c;
        const validQty = Number(c.qty) >= 1 ? Number(c.qty) : 1;
        return { ...c, qty: validQty };
      })
    );
  };

  const removeFromCart = (id) => {
    setCart((current) => current.filter((c) => c.id !== id));
  };

  // AUTOMATIC 18% GST CALCULATIONS (9% CGST + 9% SGST)
  const totalAmountOfItems = cart.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
    0
  );
  const totalGst18 = totalAmountOfItems * 0.18;
  const totalCgst = totalGst18 / 2; // 9%
  const totalSgst = totalGst18 / 2; // 9%
  const totalAmountPlusGst = totalAmountOfItems + totalGst18;

  // Open Preview Modal
  const handleOpenPreview = (e) => {
    e.preventDefault();
    if (cart.length === 0) return;

    // If user typed a new customer name not in DB, pop up the Add New Customer modal
    if (customerName.trim() && !exactCustomerMatch) {
      handleOpenNewCustomerModal(customerName.trim());
      return;
    }

    const validCart = cart
      .map((item) => ({
        ...item,
        price: Number(item.price) || 0,
        qty: Math.max(1, Number(item.qty) || 1),
      }))
      .filter((item) => item.qty > 0);

    const calcItemsTotal = validCart.reduce((s, i) => s + i.price * i.qty, 0);
    const calcGst18 = calcItemsTotal * 0.18;
    const calcCgst = calcGst18 / 2;
    const calcSgst = calcGst18 / 2;
    const calcGrandTotal = calcItemsTotal + calcGst18;

    const draftBill = {
      invoiceNo: createEstimateNumber(),
      date: new Date().toLocaleDateString('en-IN'),
      customerName: customerName.trim() || 'Walk-in Customer',
      customerPlace: customerPlace.trim(),
      customerPhone: customerPhone.trim() || 'N/A',
      items: validCart.map((item) => {
        const productAmt = item.price * item.qty;
        const itemGst = productAmt * 0.18;
        return {
          ...item,
          taxable: productAmt,
          itemGst,
          lineTotal: productAmt + itemGst,
        };
      }),
      subtotal: calcItemsTotal,
      cgst: calcCgst,
      sgst: calcSgst,
      totalTax: calcGst18,
      grandTotal: calcGrandTotal,
    };

    setPreviewBill(draftBill);
    setIsBillConfirmed(false);
    setWhatsAppStatus('');
  };

  const handleOpenHistoryBill = (sale) => {
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    const calcSubtotal =
      Number(sale.subtotal) ||
      saleItems.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 1), 0);
    const calcCgst = Number(sale.cgst || calcSubtotal * 0.09);
    const calcSgst = Number(sale.sgst || calcSubtotal * 0.09);
    const calcTotalTax = calcCgst + calcSgst;
    const calcTotal = Number(sale.grandTotal ?? sale.total ?? calcSubtotal + calcTotalTax);

    const formattedBill = {
      invoiceNo: sale.invoiceNo,
      date: sale.date || new Date(sale.createdAt || Date.now()).toLocaleDateString('en-IN'),
      customerName: sale.customerName || 'Walk-in Customer',
      customerPlace: sale.customerPlace || '',
      customerPhone: sale.customerPhone || 'N/A',
      items: saleItems.map((i) => {
        const qty = Number(i.qty || 1);
        const price = Number(i.price || 0);
        const productAmt = price * qty;
        const itemGst = productAmt * 0.18;
        return {
          ...i,
          price,
          qty,
          taxable: productAmt,
          itemGst,
          lineTotal: productAmt + itemGst,
        };
      }),
      subtotal: calcSubtotal,
      cgst: calcCgst,
      sgst: calcSgst,
      totalTax: calcTotalTax,
      grandTotal: calcTotal,
      pdfUrl: sale.pdfPath || sale.pdfUrl || '',
    };

    setPreviewBill(formattedBill);
    setIsBillConfirmed(true);
    setWhatsAppStatus('success:Viewing confirmed historical estimate.');
  };

  const handleConfirmPrintAndSend = async () => {
    if (!previewBill || isProcessing) return;

    if (isBillConfirmed) {
      window.print();
      return;
    }

    const cleanPhone = previewBill.customerPhone.replace(/\D/g, '');
    if (sendWhatsAppToggle && (!cleanPhone || cleanPhone.length < 10)) {
      setWhatsAppStatus(
        'error:Valid 10-digit WhatsApp number required! Bill was NOT saved.'
      );
      return;
    }

    setIsProcessing(true);
    setWhatsAppStatus(
      sendWhatsAppToggle
        ? 'sending:Verifying WhatsApp, sending full Estimate PDF, and recording in database...'
        : 'sending:Archiving full Estimate PDF and recording in database...'
    );

    try {
      const response = await fetch(`${API_BASE_URL}/api/complete-bill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNo: previewBill.invoiceNo,
          date: previewBill.date,
          customerName: previewBill.customerName,
          customerPlace: previewBill.customerPlace,
          customerPhone: cleanPhone,
          items: previewBill.items,
          subtotal: previewBill.subtotal,
          cgst: previewBill.cgst,
          sgst: previewBill.sgst,
          total: previewBill.grandTotal,
          sendWhatsApp: sendWhatsAppToggle,
          storeName,
          storeGstin,
          storeAddress,
          storePhone,
          upiId: storeUpiId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setWhatsAppStatus(
          `error:${data.error || 'Failed to complete bill. Nothing was saved to DB.'}`
        );
        if (!waState.connected && sendWhatsAppToggle) {
          setShowWaQrModal(true);
        }
        return;
      }

      const confirmedBill = {
        ...previewBill,
        pdfUrl: data.pdfUrl,
        pdfPath: data.pdfUrl,
      };
      onCompleteBill(confirmedBill, data.customers);
      setPreviewBill(confirmedBill);
      setIsBillConfirmed(true);
      setLastBill(confirmedBill);
      setCart([]);
      setCustomerName('');
      setCustomerPlace('');
      setCustomerPhone('');

      setWhatsAppStatus(`success:${data.message}`);

      setTimeout(() => {
        window.print();
      }, 350);
    } catch {
      setWhatsAppStatus(
        'error:Network error reaching backend server. Bill was NOT marked as completed.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const generateUpiQrUrl = () => {
    if (!previewBill) return '';
    const upiString = `upi://pay?pa=${storeUpiId}&pn=${encodeURIComponent(storeName)}&am=${previewBill.grandTotal.toFixed(2)}&cu=INR`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiString)}`;
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('pos')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'pos'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FilePlus2 size={14} />
            New Bill / POS
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'history'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <History size={14} />
            Billing History ({sales.length})
          </button>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          <button
            type="button"
            onClick={() => handleOpenNewCustomerModal('')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold cursor-pointer"
          >
            <UserPlus size={14} />
            + New Customer
          </button>

          <button
            type="button"
            onClick={() => setShowAddItemModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
          >
            <PlusCircle size={14} />
            + Add Item to DB
          </button>

          {waState.connected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              <Wifi size={13} /> WhatsApp Connected
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowWaQrModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold cursor-pointer"
            >
              <QrCode size={13} />
              Link WhatsApp QR
            </button>
          )}
        </div>
      </div>

      {/* ADD NEW CUSTOMER POPUP MODAL (Name, Place, Phone) */}
      {showNewCustomerModal && (
        <div
          onClick={() => setShowNewCustomerModal(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateCustomerInDb}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <UserPlus size={18} className="text-indigo-600" />
                Add New Customer to Database
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {customerError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                {customerError}
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              <label className="block font-semibold text-gray-700">
                Customer / Studio Name *
                <div className="mt-1 flex items-center rounded-xl border border-gray-200 px-3 py-2.5 focus-within:border-indigo-600">
                  <User size={15} className="text-gray-400 mr-2" />
                  <input
                    required
                    autoFocus
                    value={newCustomerForm.name}
                    onChange={(e) =>
                      setNewCustomerForm({ ...newCustomerForm, name: e.target.value })
                    }
                    placeholder="e.g. n studio"
                    className="w-full text-sm outline-none bg-transparent text-gray-900"
                  />
                </div>
              </label>

              <label className="block font-semibold text-gray-700">
                Place / Town *
                <div className="mt-1 flex items-center rounded-xl border border-gray-200 px-3 py-2.5 focus-within:border-indigo-600">
                  <MapPin size={15} className="text-gray-400 mr-2" />
                  <input
                    required
                    value={newCustomerForm.place}
                    onChange={(e) =>
                      setNewCustomerForm({ ...newCustomerForm, place: e.target.value })
                    }
                    placeholder="e.g. kvp / Tirunelveli"
                    className="w-full text-sm outline-none bg-transparent text-gray-900"
                  />
                </div>
              </label>

              <label className="block font-semibold text-gray-700">
                WhatsApp Phone Number *
                <div className="mt-1 flex items-center rounded-xl border border-gray-200 px-3 py-2.5 focus-within:border-indigo-600">
                  <Phone size={15} className="text-gray-400 mr-2" />
                  <input
                    required
                    type="tel"
                    value={newCustomerForm.phone}
                    onChange={(e) =>
                      setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })
                    }
                    placeholder="e.g. 9876543210"
                    className="w-full text-sm outline-none bg-transparent text-gray-900"
                  />
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingCustomer}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                {isSavingCustomer ? 'Saving...' : 'Save & Select Customer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADD NEW ITEM TO DB MODAL (No GST Input Asked — 18% Calculated Automatically) */}
      {showAddItemModal && (
        <div
          onClick={() => setShowAddItemModal(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateItemInDb}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900">
                Add New Product to Database
              </h3>
              <button
                type="button"
                onClick={() => setShowAddItemModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-gray-700">
                Name of the Product *
                <input
                  required
                  value={newItemForm.name}
                  onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                  placeholder="e.g. 12X36HD FULL SILKMATT"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-600"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block font-semibold text-gray-700">
                  SKU / Code
                  <input
                    value={newItemForm.sku}
                    onChange={(e) => setNewItemForm({ ...newItemForm, sku: e.target.value })}
                    placeholder="Auto-generated if empty"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-600"
                  />
                </label>
                <label className="block font-semibold text-gray-700">
                  Category
                  <input
                    value={newItemForm.category}
                    onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })}
                    placeholder="Photo Books"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-600"
                  />
                </label>
              </div>

              <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-2">
                <label className="block font-bold text-gray-800">
                  Amount of the Product (₹) *
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItemForm.price}
                    onChange={(e) => setNewItemForm({ ...newItemForm, price: e.target.value })}
                    placeholder="e.g. 1000"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-indigo-600"
                  />
                </label>
                <div className="flex justify-between text-[11px] text-indigo-700 font-semibold pt-1">
                  <span>Auto 18% GST: ₹{((Number(newItemForm.price) || 0) * 0.18).toFixed(2)}</span>
                  <span>
                    Amount + GST: ₹{((Number(newItemForm.price) || 0) * 1.18).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block font-semibold text-gray-700">
                  Opening Stock Qty *
                  <input
                    required
                    type="number"
                    min="0"
                    value={newItemForm.stock}
                    onChange={(e) => setNewItemForm({ ...newItemForm, stock: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-600"
                  />
                </label>
                <label className="block font-semibold text-gray-700">
                  Low Stock Alert Level
                  <input
                    type="number"
                    min="0"
                    value={newItemForm.minStock}
                    onChange={(e) => setNewItemForm({ ...newItemForm, minStock: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-600"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddItemModal(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingItem}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                {isSavingItem ? 'Saving...' : 'Save Item to DB'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VIEW 1: BILLING HISTORY SUB-TAB */}
      {subTab === 'history' ? (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden print:hidden">
          <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <History size={18} className="text-indigo-600" /> Past Confirmed Estimates & Invoices
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                View all generated bills with Product Amount, 18% GST (CGST + SGST), and Total.
              </p>
            </div>
            <div className="flex items-center rounded-xl border border-gray-200 bg-[#f8f9fb] px-3.5 py-2 sm:w-80">
              <Search size={16} className="text-gray-400 mr-2" />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search Estimate No, Customer, Place..."
                className="bg-transparent text-sm outline-none w-full text-gray-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500">
                  <th className="p-4">Estimate No.</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Customer & Place</th>
                  <th className="p-4 text-right">Amount of Items</th>
                  <th className="p-4 text-right">SGST (9%)</th>
                  <th className="p-4 text-right">CGST (9%)</th>
                  <th className="p-4 text-right">Amount + GST</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredSales.map((sale) => {
                  const totalVal = Number(sale.grandTotal ?? sale.total ?? 0);
                  const cgstVal = Number(sale.cgst || 0);
                  const sgstVal = Number(sale.sgst || 0);
                  const gstVal = cgstVal + sgstVal;
                  const itemsAmt = Number(sale.subtotal || totalVal - gstVal);
                  const pdfLink = sale.pdfPath || sale.pdfUrl;

                  return (
                    <tr key={sale.id || sale.invoiceNo} className="hover:bg-gray-50/70">
                      <td className="p-4 font-bold text-indigo-600">#{sale.invoiceNo}</td>
                      <td className="p-4 text-gray-600 text-xs">{sale.date}</td>
                      <td className="p-4">
                        <p className="font-semibold text-gray-900">
                          {sale.customerName}
                          {sale.customerPlace ? (
                            <span className="ml-1.5 text-xs font-medium text-indigo-600">
                              ({sale.customerPlace})
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-gray-400">+{sale.customerPhone}</p>
                      </td>
                      <td className="p-4 text-right text-gray-700">₹{itemsAmt.toFixed(2)}</td>
                      <td className="p-4 text-right text-purple-700 font-medium">
                        ₹{sgstVal.toFixed(2)}
                      </td>
                      <td className="p-4 text-right text-purple-700 font-medium">
                        ₹{cgstVal.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-bold text-gray-900">
                        ₹{totalVal.toFixed(2)}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenHistoryBill(sale)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold cursor-pointer"
                          >
                            <Eye size={13} /> View / Print
                          </button>
                          {pdfLink && (
                            <a
                              href={pdfLink}
                              download
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold"
                            >
                              <Download size={13} /> PDF
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredSales.length === 0 && (
              <div className="py-14 text-center text-gray-400 text-sm flex flex-col items-center">
                <History size={32} className="mb-2 text-gray-300" />
                No confirmed bills found in history.
              </div>
            )}
          </div>
        </section>
      ) : (
        /* VIEW 2: NEW BILL / POS SUB-TAB */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Select Items for Billing</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Click an item to add it. 18% GST (9% CGST + 9% SGST) is calculated automatically.
                  </p>
                </div>
                <div className="flex items-center rounded-xl border border-gray-200 bg-[#f8f9fb] px-3.5 py-2 sm:w-72">
                  <Search size={16} className="text-gray-400 mr-2" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search item or SKU..."
                    className="bg-transparent text-sm outline-none w-full text-gray-800"
                  />
                </div>
              </div>

              {availableItems.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-gray-200 rounded-xl space-y-2">
                  <p className="text-sm text-gray-500 font-medium">
                    Your database has no items yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                  >
                    <PlusCircle size={14} /> Add Your First Item to DB
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
                  {availableItems.map((item) => {
                    const inCart = Number(cart.find((c) => c.id === item.id)?.qty) || 0;
                    const remaining = item.stock - inCart;
                    const isOut = remaining <= 0;
                    const baseAmt = Number(item.price) || 0;
                    const autoGst = baseAmt * 0.18;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={isOut}
                        onClick={() => addToCart(item)}
                        className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all ${
                          isOut
                            ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                            : 'border-gray-200/80 hover:border-indigo-500 hover:bg-indigo-50/20 bg-white cursor-pointer'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                              {item.name}
                            </p>
                            <span className="text-xs font-bold text-indigo-600 shrink-0">
                              ₹{baseAmt}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            + 18% GST (₹{autoGst.toFixed(2)}) ={' '}
                            <strong>₹{(baseAmt + autoGst).toFixed(2)}</strong>
                          </p>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span
                            className={
                              remaining <= item.minStock
                                ? 'text-red-500 font-medium'
                                : 'text-emerald-600 font-medium'
                            }
                          >
                            {remaining} left
                          </span>
                          {inCart > 0 && (
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                              {inCart} in bill
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Current Bill Items Table with Exact Requested Columns */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Receipt size={18} className="text-indigo-600" /> Current Bill Items
                </h3>
                <span className="text-xs text-gray-400 font-medium">
                  {cart.length} unique items
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500">
                      <th className="p-3.5">Name of the product</th>
                      <th className="p-3.5 text-center">Qty</th>
                      <th className="p-3.5 text-right">Amount of the product</th>
                      <th className="p-3.5 text-right">SGST (9%)</th>
                      <th className="p-3.5 text-right">CGST (9%)</th>
                      <th className="p-3.5 text-right">Amount + GST</th>
                      <th className="p-3.5 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {cart.map((item) => {
                      const maxStock = items.find((i) => i.id === item.id)?.stock || item.stock;
                      const numericQty = Number(item.qty) || 0;
                      const productAmount = (Number(item.price) || 0) * numericQty;
                      const gstAmount = productAmount * 0.18;
                      const cgstAmount = productAmount * 0.09;
                      const sgstAmount = productAmount * 0.09;
                      const amountPlusGst = productAmount + gstAmount;

                      return (
                        <tr key={item.id}>
                          <td className="p-3.5">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-400">
                              Rate: ₹{item.price} • Max: {maxStock}
                            </p>
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateQty(item.id, -1)}
                                className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 cursor-pointer"
                              >
                                <Minus size={13} />
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={maxStock}
                                value={item.qty}
                                onChange={(e) => setDirectQty(item.id, e.target.value)}
                                onBlur={() => handleQtyBlur(item.id)}
                                className="w-14 text-center font-bold text-gray-900 border border-gray-300 rounded-lg py-1 px-1 outline-none focus:border-indigo-600"
                              />
                              <button
                                type="button"
                                onClick={() => updateQty(item.id, 1)}
                                className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 cursor-pointer"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </td>
                          <td className="p-3.5 text-right font-semibold text-gray-800">
                            ₹{productAmount.toFixed(2)}
                          </td>
                          <td className="p-3.5 text-right font-medium text-indigo-700">
                            ₹{sgstAmount.toFixed(2)}
                          </td>
                          <td className="p-3.5 text-right font-medium text-indigo-700">
                            ₹{cgstAmount.toFixed(2)}
                          </td>
                          <td className="p-3.5 text-right font-bold text-gray-900">
                            ₹{amountPlusGst.toFixed(2)}
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.id)}
                              className="text-gray-400 hover:text-red-500 cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {cart.length === 0 && (
                  <div className="py-12 text-center text-gray-400 text-sm flex flex-col items-center">
                    <Package size={32} className="mb-2 text-gray-300" />
                    No items added yet. Click any item above to start billing.
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: CUSTOMER AUTOCOMPLETE & EXACT AMOUNTS BOX */}
          <div className="space-y-6">
            <form
              onSubmit={handleOpenPreview}
              className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] space-y-5"
            >
              <div>
                <h3 className="text-base font-semibold text-gray-900">Customer & Bill Summary</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Search customer by name/place or add a new customer
                </p>
              </div>

              <div className="space-y-3.5">
                <div className="relative" ref={customerDropdownRef}>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Customer / Studio Name
                    <div className="mt-1.5 flex items-center rounded-xl border border-gray-200 px-3 py-2.5 focus-within:border-indigo-600">
                      <User size={16} className="text-gray-400 mr-2 shrink-0" />
                      <input
                        type="text"
                        value={customerName}
                        onFocus={() => setShowCustomerDropdown(true)}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        placeholder="Type customer name (e.g. n studio)"
                        className="w-full text-sm outline-none bg-transparent text-gray-800 font-normal"
                      />
                      {customerPlace && (
                        <span className="ml-2 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold shrink-0">
                          {customerPlace}
                        </span>
                      )}
                    </div>
                  </label>

                  {showCustomerDropdown && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-gray-100">
                      {matchingCustomers.map((c) => {
                        const pendingBal = Number(c.balance || 0);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectExistingCustomer(c)}
                            className="w-full px-3.5 py-2.5 text-left hover:bg-indigo-50/60 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div>
                              <p className="text-xs font-bold text-gray-900">
                                {c.name}{' '}
                                {c.place && (
                                  <span className="text-indigo-600 font-semibold">
                                    — {c.place}
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {c.phone.startsWith('NAME:') ? 'No phone' : `+${c.phone}`}
                              </p>
                            </div>
                            {pendingBal > 0 && (
                              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                                Pending: ₹{pendingBal.toFixed(0)}
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {customerName.trim() && !exactCustomerMatch && (
                        <button
                          type="button"
                          onClick={() => handleOpenNewCustomerModal(customerName.trim())}
                          className="w-full px-3.5 py-3 text-left bg-indigo-50/70 hover:bg-indigo-100/80 flex items-center justify-between text-indigo-700 font-bold text-xs cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <UserPlus size={15} />
                            New Customer: &quot;{customerName.trim()}&quot;
                          </span>
                          <span className="underline">Add Details →</span>
                        </button>
                      )}

                      {matchingCustomers.length === 0 && !customerName.trim() && (
                        <div className="p-3 text-center text-xs text-gray-400">
                          No saved customers yet. Type a name to add a new customer.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Place / Town
                    <div className="mt-1.5 flex items-center rounded-xl border border-gray-200 px-3 py-2.5">
                      <MapPin size={15} className="text-gray-400 mr-1.5 shrink-0" />
                      <input
                        type="text"
                        value={customerPlace}
                        onChange={(e) => setCustomerPlace(e.target.value)}
                        placeholder="e.g. kvp"
                        className="w-full text-sm outline-none bg-transparent text-gray-800 font-normal"
                      />
                    </div>
                  </label>

                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    WhatsApp Number
                    <div className="mt-1.5 flex items-center rounded-xl border border-gray-200 px-3 py-2.5">
                      <Phone size={15} className="text-gray-400 mr-1.5 shrink-0" />
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="9876543210"
                        className="w-full text-sm outline-none bg-transparent text-gray-800 font-normal"
                      />
                    </div>
                  </label>
                </div>

                <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendWhatsAppToggle}
                    onChange={(e) => setSendWhatsAppToggle(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-medium text-gray-700">
                    Auto-send PDF to Customer WhatsApp on Confirm
                  </span>
                </label>
              </div>

              {/* Exact Requested 4-Row Amounts Box */}
              <div className="bg-[#f8f9fa] rounded-xl p-4 space-y-2.5 text-sm border border-gray-200">
                <div className="flex justify-between text-gray-700">
                  <span>Total amount of the items =</span>
                  <span className="font-semibold text-gray-900">
                    ₹{totalAmountOfItems.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-indigo-700 text-xs font-medium">
                  <span>Total CGST of the bill (9%) =</span>
                  <span>₹{totalCgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-indigo-700 text-xs font-medium">
                  <span>Total SGST of the bill (9%) =</span>
                  <span>₹{totalSgst.toFixed(2)}</span>
                </div>
                <div className="border-t border-gray-300 pt-2.5 flex justify-between text-base font-bold text-gray-900">
                  <span>Total amount + GST =</span>
                  <span className="text-indigo-600">₹{totalAmountPlusGst.toFixed(2)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={cart.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white py-3 px-4 text-sm font-semibold transition-colors shadow-sm cursor-pointer"
              >
                <Eye size={18} />
                Preview Estimate
              </button>
            </form>

            {lastBill && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-800">
                    <p className="font-semibold">Last Estimate: #{lastBill.invoiceNo}</p>
                    <p className="mt-0.5">
                      Total amount + GST = ₹{Number(lastBill.grandTotal).toFixed(2)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewBill(lastBill);
                    setIsBillConfirmed(true);
                  }}
                  className="text-xs font-semibold text-emerald-700 underline shrink-0 cursor-pointer"
                >
                  Re-open
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WHATSAPP QR MODAL */}
      {showWaQrModal && (
        <div
          onClick={() => setShowWaQrModal(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 text-center space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <QrCode size={18} className="text-emerald-600" />
                Link Studio WhatsApp for Auto-PDF
              </h3>
              <button
                type="button"
                onClick={() => setShowWaQrModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {waState.qrDataUrl ? (
              <div className="space-y-3">
                <img
                  src={waState.qrDataUrl}
                  alt="WhatsApp Pairing QR"
                  className="w-56 h-56 mx-auto border border-gray-200 rounded-xl p-2"
                />
                <p className="text-xs text-gray-600">
                  Open <strong>WhatsApp</strong> on your studio phone → Tap{' '}
                  <strong>Linked Devices</strong> → <strong>Link a Device</strong> and scan this QR code.
                </p>
              </div>
            ) : (
              <div className="py-8 text-xs text-gray-500">
                Generating WhatsApp QR code... Make sure <code>node server/index.js</code> is running.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ESTIMATE PREVIEW MODAL (Matches Exact Requested Columns & Amounts Box) */}
      {previewBill && (
        <div
          onClick={() => !isProcessing && setPreviewBill(null)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0 print:block"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden my-8 print:shadow-none print:border-none print:my-0 print:max-w-full"
          >
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2.5">
                <FileCheck2 size={20} className="text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Estimate Preview (#{previewBill.invoiceNo})
                  </h3>
                  <p className="text-xs text-gray-500">
                    {isBillConfirmed
                      ? 'Confirmed! Saved in DB and added to Customer Pending Actions.'
                      : 'Review 18% GST split below before confirming.'}
                  </p>
                </div>
              </div>
              <button
                disabled={isProcessing}
                onClick={() => setPreviewBill(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {whatsAppStatus && (
              <div
                className={`px-6 py-3 text-xs font-semibold flex items-center justify-between print:hidden ${
                  whatsAppStatus.startsWith('error:')
                    ? 'bg-red-50 text-red-700 border-b border-red-200'
                    : whatsAppStatus.startsWith('sending:')
                      ? 'bg-amber-50 text-amber-800 border-b border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-b border-emerald-200'
                }`}
              >
                <span>{whatsAppStatus.replace(/^(error:|success:|sending:)/, '')}</span>
                {previewBill.pdfUrl && (
                  <a
                    href={previewBill.pdfUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline text-indigo-700 font-bold ml-4"
                  >
                    <Download size={14} /> Download Archived PDF
                  </a>
                )}
              </div>
            )}

            {/* PRINTABLE ESTIMATE SHEET */}
            <div className="p-8 space-y-4 text-gray-900 text-xs" id="printable-invoice">
              <div className="grid grid-cols-3 items-start pb-3">
                <div>
                  <img
                    src="/logo.jpg"
                    alt="Photo Books"
                    className="h-14 w-auto object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div className="text-center pt-2">
                  <h1 className="text-lg font-bold tracking-wide">Estimate</h1>
                </div>
                <div className="text-right space-y-0.5">
                  <h2 className="text-base font-extrabold text-gray-900">{storeName}</h2>
                  <p className="text-[11px] text-gray-600 leading-tight">{storeAddress}</p>
                  <p className="text-[11px] font-semibold text-gray-800">Phone no.: {storePhone}</p>
                  <p className="text-[11px] font-semibold text-gray-800">
                    GSTIN: {storeGstin}, State: 33-Tamil Nadu
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 border border-black">
                <div className="border-r border-black">
                  <div className="bg-gray-200 border-b border-black px-2.5 py-1 font-bold">
                    Estimate For
                  </div>
                  <div className="p-2.5 space-y-0.5 bg-white text-gray-900">
                    <p className="font-bold text-sm">{previewBill.customerName}</p>
                    {previewBill.customerPlace && (
                      <p className="text-gray-700">{previewBill.customerPlace}</p>
                    )}
                    {previewBill.customerPhone !== 'N/A' && (
                      <p className="text-gray-700">+91 {previewBill.customerPhone}</p>
                    )}
                  </div>
                </div>
                <div>
                  <div className="bg-gray-200 border-b border-black px-2.5 py-1 font-bold text-right">
                    Estimate Details
                  </div>
                  <div className="p-2.5 space-y-1 text-right">
                    <p>
                      Estimate No. : <strong>{previewBill.invoiceNo}</strong>
                    </p>
                    <p>
                      Date : <strong>{previewBill.date}</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Invoice table with the GST split into 9% SGST and 9% CGST. */}
              <table className="w-full border-collapse border border-black text-xs">
                <thead>
                  <tr className="bg-gray-500 text-white font-bold">
                    <th className="border border-black p-1.5 w-8 text-left">SL NO</th>
                    <th className="border border-black p-1.5 text-left">Name of the product</th>
                    <th className="border border-black p-1.5 w-16 text-center">Qty</th>
                    <th className="border border-black p-1.5 w-32 text-right">
                      Amount of the product
                    </th>
                    <th className="border border-black p-1.5 w-24 text-right">SGST (9%)</th>
                    <th className="border border-black p-1.5 w-24 text-right">CGST (9%)</th>
                    <th className="border border-black p-1.5 w-32 text-right">Amount + GST</th>
                  </tr>
                </thead>
                <tbody>
                  {previewBill.items.map((item, idx) => {
                    const qty = Number(item.qty || 1);
                    const productAmt = Number(item.price || 0) * qty;
                    const gstAmt = productAmt * 0.18;
                    const sgstAmt = productAmt * 0.09;
                    const cgstAmt = productAmt * 0.09;
                    const totalWithGst = productAmt + gstAmt;

                    return (
                      <tr key={item.id || idx}>
                        <td className="border-x border-b border-gray-300 p-1.5">{idx + 1}</td>
                        <td className="border-x border-b border-gray-300 p-1.5 font-bold">
                          {item.name}
                        </td>
                        <td className="border-x border-b border-gray-300 p-1.5 text-center">
                          {qty}
                        </td>
                        <td className="border-x border-b border-gray-300 p-1.5 text-right">
                          ₹ {productAmt.toFixed(2)}
                        </td>
                        <td className="border-x border-b border-gray-300 p-1.5 text-right">
                          ₹ {sgstAmt.toFixed(2)}
                        </td>
                        <td className="border-x border-b border-gray-300 p-1.5 text-right">
                          ₹ {cgstAmt.toFixed(2)}
                        </td>
                        <td className="border-x border-b border-gray-300 p-1.5 text-right font-semibold">
                          ₹ {totalWithGst.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-bold border-t border-black bg-gray-50">
                    <td className="border border-black p-1.5"></td>
                    <td className="border border-black p-1.5">Total</td>
                    <td className="border border-black p-1.5 text-center">
                      {previewBill.items.reduce((s, i) => s + Number(i.qty || 0), 0)}
                    </td>
                    <td className="border border-black p-1.5 text-right">
                      ₹ {Number(previewBill.subtotal).toFixed(2)}
                    </td>
                    <td className="border border-black p-1.5 text-right">
                      ₹ {Number(previewBill.sgst).toFixed(2)}
                    </td>
                    <td className="border border-black p-1.5 text-right">
                      ₹ {Number(previewBill.cgst).toFixed(2)}
                    </td>
                    <td className="border border-black p-1.5 text-right">
                      ₹ {Number(previewBill.grandTotal).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="grid grid-cols-12 border border-black">
                <div className="col-span-6 border-r border-b border-black">
                  <div className="bg-gray-500 text-white px-2.5 py-1 font-bold border-b border-black">
                    Estimate Amount In Words
                  </div>
                  <div className="p-2.5 font-medium">
                    {amountToIndianWords(previewBill.grandTotal)}
                  </div>
                </div>

                {/* Exact Requested Amounts Box */}
                <div className="col-span-6 border-b border-black">
                  <div className="bg-gray-500 text-white px-2.5 py-1 font-bold border-b border-black">
                    Amounts
                  </div>
                  <div className="divide-y divide-black">
                    <div className="flex justify-between px-2.5 py-1.5">
                      <span>Total amount of the items =</span>
                      <span className="font-semibold">
                        ₹ {Number(previewBill.subtotal).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between px-2.5 py-1.5 text-indigo-900">
                      <span>Total CGST of the bill (9%) =</span>
                      <span className="font-medium">
                        ₹ {Number(previewBill.cgst).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between px-2.5 py-1.5 text-indigo-900">
                      <span>Total SGST of the bill (9%) =</span>
                      <span className="font-medium">
                        ₹ {Number(previewBill.sgst).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between px-2.5 py-1.5 font-bold text-sm bg-gray-100">
                      <span>Total amount + GST =</span>
                      <span>₹ {Number(previewBill.grandTotal).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="col-span-5 border-r border-black">
                  <div className="bg-gray-500 text-white px-2.5 py-1 font-bold border-b border-black">
                    Bank Details
                  </div>
                  <div className="p-2.5 flex items-center gap-3">
                    <img
                      src={generateUpiQrUrl()}
                      alt="UPI QR"
                      className="w-16 h-16 border border-gray-300 shrink-0"
                    />
                    <div className="text-[10px] space-y-0.5 leading-snug">
                      <p>Name : ICICI BANK LIMITED, TIRUNELVELI JUNCTION</p>
                      <p>Account No. : 613505500805</p>
                      <p>IFSC code : ICIC0006135</p>
                      <p>Account holder&apos;s name : {storeName}</p>
                    </div>
                  </div>
                </div>

                <div className="col-span-4 border-r border-black">
                  <div className="bg-gray-500 text-white px-2.5 py-1 font-bold border-b border-black">
                    Terms and Conditions
                  </div>
                  <div className="p-2.5 text-[11px]">Thanks for doing business with us!</div>
                </div>

                <div className="col-span-3 flex flex-col justify-between p-2.5 text-center">
                  <p className="text-[11px]">For : {storeName}</p>
                  <p className="font-bold text-[11px] pt-10">Authorized Signatory</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setPreviewBill(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                {isBillConfirmed ? 'Close Window' : '← Back & Edit Bill'}
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmPrintAndSend}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
              >
                <Printer size={16} />
                {isProcessing
                  ? 'Processing (Validating & Sending)...'
                  : isBillConfirmed
                    ? 'Re-Print Confirmed Estimate'
                    : sendWhatsAppToggle
                      ? 'Confirm, Send WhatsApp PDF & Print'
                      : 'Confirm, Archive PDF & Print'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}