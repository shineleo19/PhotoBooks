// src/components/Dashboard.jsx
import { useState } from 'react';
import {
  CheckCircle2,
  ChartNoAxesCombined,
  ReceiptText,
  BadgeIndianRupee,
  Clock,
  BookOpen,
  Edit3,
  Mail,
  Phone,
  ShieldCheck,
  MapPin,
  TrendingUp,
  Receipt,
  Building2,
  X,
} from 'lucide-react';

function MetricCard({ label, value, detail, icon: Icon, tone }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <div className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon size={17} />
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{detail}</p>
    </div>
  );
}

export default function Dashboard({
  openPage,
  items = [],
  sales = [],
  businessInfo = {},
  setBusinessInfo,
}) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  const cardStyle =
    'rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]';

  // --- Dynamic Calculations ---
  const todayRevenue = sales.reduce((sum, sale) => sum + (sale.grandTotal || sale.total || 0), 0);
  const totalSalesCount = sales.length;

  const cgstCollected = sales.reduce((sum, sale) => sum + (sale.cgst || 0), 0);
  const sgstCollected = sales.reduce((sum, sale) => sum + (sale.sgst || 0), 0);
  const totalGst = cgstCollected + sgstCollected;

  const lowStockAlerts = items.filter((item) => item.stock <= item.minStock);
  const recentSales = sales.slice(0, 3);

  const currentYear = new Date().getFullYear();
  const fiscalYear = `April ${currentYear} - March ${currentYear + 1}`;

  const handleSaveProfile = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (setBusinessInfo) {
      setBusinessInfo({
        businessName: String(form.get('businessName')).trim(),
        email: String(form.get('email')).trim(),
        phone: String(form.get('phone')).trim(),
        supportPhone: String(form.get('supportPhone')).trim(),
        gstin: String(form.get('gstin')).trim().toUpperCase(),
        address: String(form.get('address')).trim(),
        upiId: String(form.get('upiId')).trim(),
        terminalId: String(form.get('terminalId')).trim().toUpperCase(),
      });
    }
    setIsEditingProfile(false);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  return (
    <div className="w-full space-y-6">
      {savedBanner && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-3.5 text-xs font-semibold text-emerald-700 flex items-center gap-2">
          <CheckCircle2 size={16} /> Business & GST Details updated! All new invoices will use this information.
        </div>
      )}

      {/* ROW 1: Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          label="Today's Revenue"
          value={`₹${todayRevenue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          detail="Live daily gross"
          icon={ChartNoAxesCombined}
          tone="emerald"
        />
        <MetricCard
          label="Total Sales Count"
          value={totalSalesCount}
          detail="Invoices generated today"
          icon={ReceiptText}
          tone="blue"
        />
        <MetricCard
          label="GST Collected"
          value={`₹${totalGst.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          detail="CGST + SGST combined"
          icon={BadgeIndianRupee}
          tone="purple"
        />
      </div>

      {/* ROW 2: Today's GST Invoices + Pending Restock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className={`lg:col-span-2 ${cardStyle}`}>
          <div className="mb-5 flex items-center justify-between border-b border-gray-50 pb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Today's GST Invoices</h3>
              <p className="mt-1 text-xs text-gray-400">Recent transactions processed today</p>
            </div>
            <button
              onClick={() => openPage('TodaySales', 'Revenue & Audit')}
              className="text-xs font-medium text-indigo-600 hover:underline cursor-pointer"
            >
              View all →
            </button>
          </div>

          {recentSales.length === 0 ? (
            <div className="bg-[#f8f9fa] rounded-xl py-9 px-4 flex items-center justify-center gap-2.5 text-sm text-gray-400">
              <Clock size={16} className="text-gray-400" />
              <span>No invoices generated yet today.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSales.map((sale) => (
                <div
                  key={sale.invoiceNo}
                  className="bg-[#f8f9fa] rounded-xl p-4 flex items-center justify-between border border-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                      <Receipt size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{sale.invoiceNo}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {sale.customerName} • {sale.items?.length || 1} items
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-gray-900">
                    ₹{(sale.grandTotal || sale.total || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={cardStyle}>
          <div className="mb-5 flex items-center justify-between border-b border-gray-50 pb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Pending Restock</h3>
              <p className="mt-1 text-xs text-gray-400">Raw materials below minimum levels</p>
            </div>
            <button
              onClick={() => openPage('PendingActions', 'Pending Actions')}
              className="text-xs font-medium text-indigo-600 hover:underline cursor-pointer"
            >
              All alerts →
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[220px] pr-1">
            {lowStockAlerts.length === 0 ? (
              <div className="bg-[#f8f9fa] rounded-xl py-8 px-4 flex items-center justify-center gap-2.5 text-sm text-gray-400 text-center border border-gray-50">
                <span>
                  Inventory is healthy.
                  <br />
                  No items below minimum stock.
                </span>
              </div>
            ) : (
              lowStockAlerts.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#f8f9fa] border border-gray-50 rounded-xl p-4 flex items-center gap-3.5"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.name}</p>
                    <p className="text-xs text-red-500 mt-0.5 font-medium">
                      {item.stock} units remaining (Min: {item.minStock})
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ROW 3: Fast Moving Stock + Database Sync Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className={cardStyle}>
          <div className="mb-5 flex items-center justify-between border-b border-gray-50 pb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Studio Material Breakdown</h3>
              <p className="mt-1 text-xs text-gray-400">Active raw material categories</p>
            </div>
            <button
              onClick={() => openPage('Inventory', 'Inventory')}
              className="text-xs font-medium text-indigo-600 hover:underline cursor-pointer"
            >
              Catalog →
            </button>
          </div>
          <div className="bg-[#f8f9fa] rounded-xl py-8 px-4 flex items-center justify-center gap-2.5 text-sm text-gray-400 border border-gray-50">
            <BookOpen size={16} />
            <span>
              Tracking {items.length} studio raw materials across Paper, Gum, Tapes, Ink & Pads
            </span>
          </div>
        </section>

        <section className={`${cardStyle} flex flex-col justify-between`}>
          <div className="mb-5 flex items-center justify-between border-b border-gray-50 pb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Database & Cloud Sync</h3>
              <p className="mt-1 text-xs text-gray-400">SQLite to Supabase status</p>
            </div>
            <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
              100% Synced
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">All local SQLite records securely backed up.</p>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="w-full h-full bg-emerald-500 rounded-full"></div>
            </div>
          </div>
        </section>
      </div>

      {/* ROW 4: Store & System Environment */}
      <section className={cardStyle}>
        <div className="mb-5 flex items-center justify-between border-b border-gray-50 pb-4">
          <div>
            <h3 className="font-semibold text-gray-900">Store & System Environment</h3>
            <p className="mt-1 text-xs text-gray-400">Active terminal and connection details</p>
          </div>
          <button
            onClick={() => openPage('Warehouse', 'Warehouse')}
            className="text-xs font-medium text-indigo-600 hover:underline cursor-pointer"
          >
            Details →
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#f8f9fa] border border-gray-50 rounded-xl p-5 min-h-[92px] flex flex-col justify-between">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Terminal ID</p>
            <p className="text-[15px] font-semibold text-gray-900 mt-2">
              {businessInfo.terminalId || 'POS-MAIN-01'}
            </p>
          </div>
          <div className="bg-[#f8f9fa] border border-gray-50 rounded-xl p-5 min-h-[92px] flex flex-col justify-between">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Local Database
            </p>
            <p className="text-[15px] font-semibold text-gray-900 mt-2">SQLite (Active)</p>
          </div>
          <div className="bg-[#f8f9fa] border border-gray-50 rounded-xl p-5 min-h-[92px] flex flex-col justify-between">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              WhatsApp API
            </p>
            <p className="text-[15px] font-semibold text-emerald-600 mt-2 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Connected
            </p>
          </div>
          <div className="bg-[#f8f9fa] border border-gray-50 rounded-xl p-5 min-h-[92px] flex flex-col justify-between">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Pending Sync
            </p>
            <p className="text-[15px] font-semibold text-gray-900 mt-2">None</p>
          </div>
        </div>
      </section>

      {/* ROW 5: Business Details & Tax Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className={`lg:col-span-2 ${cardStyle}`}>
          <div className="mb-5 flex items-center justify-between border-b border-gray-50 pb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Business & GST Details</h3>
              <p className="mt-1 text-xs text-gray-400">
                Printed automatically on all GST invoices & WhatsApp bills
              </p>
            </div>
            <button
              onClick={() => setIsEditingProfile(true)}
              className="text-xs font-semibold text-indigo-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              <Edit3 size={14} /> Edit Details
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Building2 size={13} /> Studio / Business Name
              </p>
              <p className="text-sm font-semibold text-gray-900">{businessInfo.businessName}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Mail size={13} /> Order & Billing Email
              </p>
              <p className="text-sm font-medium text-gray-900">{businessInfo.email}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Phone size={13} /> Primary Phone
              </p>
              <p className="text-sm font-medium text-gray-900">{businessInfo.phone}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <ShieldCheck size={13} /> Emergency / Support
              </p>
              <p className="text-sm font-medium text-gray-900">{businessInfo.supportPhone}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">
                GSTIN Registration
              </p>
              <p className="text-sm font-semibold text-indigo-600">{businessInfo.gstin}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <MapPin size={13} /> Registered Address
              </p>
              <p className="text-sm font-medium text-gray-900">{businessInfo.address}</p>
            </div>
          </div>
        </section>

        <section className={cardStyle}>
          <div className="mb-5 border-b border-gray-50 pb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-500" /> Tax & Ledger
            </h3>
            <p className="mt-1 text-xs text-gray-400">Current fiscal year snapshot</p>
          </div>

          <div className="space-y-4 text-sm bg-[#f8f9fa] border border-gray-50 rounded-xl p-5">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">CGST Collected</span>
              <span className="font-semibold text-gray-900">
                ₹
                {cgstCollected.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">SGST Collected</span>
              <span className="font-semibold text-gray-900">
                ₹
                {sgstCollected.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-200 pt-3 mt-1">
              <span className="text-gray-500 font-medium">Fiscal Year</span>
              <span className="font-bold text-gray-900 text-xs bg-white border border-gray-200 px-2 py-1 rounded">
                {fiscalYear}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* EDIT BUSINESS & GST DETAILS MODAL */}
      {isEditingProfile && (
        <div
          onClick={() => setIsEditingProfile(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveProfile}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-gray-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Edit Business & GST Profile</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  These details appear on your printed GST invoices and WhatsApp receipts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase text-gray-500 sm:col-span-2">
                Studio / Business Name
                <input
                  name="businessName"
                  required
                  defaultValue={businessInfo.businessName}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none"
                />
              </label>

              <label className="text-xs font-semibold uppercase text-gray-500">
                GSTIN Number
                <input
                  name="gstin"
                  required
                  defaultValue={businessInfo.gstin}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal uppercase text-gray-900 outline-none"
                />
              </label>

              <label className="text-xs font-semibold uppercase text-gray-500">
                Terminal ID
                <input
                  name="terminalId"
                  required
                  defaultValue={businessInfo.terminalId || 'POS-MAIN-01'}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal uppercase text-gray-900 outline-none"
                />
              </label>

              <label className="text-xs font-semibold uppercase text-gray-500 sm:col-span-2">
                Order & Billing Email
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={businessInfo.email}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none"
                />
              </label>

              <label className="text-xs font-semibold uppercase text-gray-500">
                Primary Phone
                <input
                  name="phone"
                  required
                  defaultValue={businessInfo.phone}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none"
                />
              </label>

              <label className="text-xs font-semibold uppercase text-gray-500">
                Support / Secondary Phone
                <input
                  name="supportPhone"
                  defaultValue={businessInfo.supportPhone}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none"
                />
              </label>

              <label className="text-xs font-semibold uppercase text-gray-500 sm:col-span-2">
                Registered Store Address
                <input
                  name="address"
                  required
                  defaultValue={businessInfo.address}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none"
                />
              </label>

              <label className="text-xs font-semibold uppercase text-gray-500 sm:col-span-2">
                UPI ID
                <input
                  name="upiId"
                  required
                  defaultValue={businessInfo.upiId}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}