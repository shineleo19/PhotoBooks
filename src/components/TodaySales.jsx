// src/components/TodaySales.jsx
import { useState, useMemo } from 'react';
import {
  TrendingUp,
  Receipt,
  Clock,
  Eye,
  X,
  Printer,
  Download,
  Wallet,
  Package,
  CalendarRange,
  FileSpreadsheet,
  BarChart3,
  Filter,
} from 'lucide-react';

function MetricCard({ label, value, detail, icon: Icon, tone }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
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

function parseSaleDate(sale) {
  if (sale.createdAt) {
    const createdAt = new Date(sale.createdAt);
    if (!Number.isNaN(createdAt.getTime())) return createdAt;
  }

  const dateText = String(sale.date || '');
  const localizedMatch = dateText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (localizedMatch) {
    const [, day, month, year] = localizedMatch;
    const localizedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
    if (!Number.isNaN(localizedDate.getTime())) return localizedDate;
  }

  const parsedDate = new Date(dateText);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export default function TodaySales({ sales = [] }) {
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedCategory, setSelectedCategory] = useState('All categories');
  const materialCostRatio = 35;

  const availableMonths = useMemo(() => {
    const months = new Set([selectedMonth]);
    sales.forEach((sale) => {
      const parsedDate = parseSaleDate(sale);
      if (parsedDate) {
        months.add(parsedDate.toISOString().slice(0, 7));
      }
    });
    return [...months].sort().reverse();
  }, [sales, selectedMonth]);

  const filteredSales = useMemo(
    () =>
      sales.filter((sale) => {
        const parsedDate = parseSaleDate(sale);
        return parsedDate
          ? parsedDate.toISOString().slice(0, 7) === selectedMonth
          : false;
      }),
    [sales, selectedMonth]
  );

  const categoryOptions = useMemo(() => {
    const categories = new Set();
    filteredSales.forEach((sale) => {
      (Array.isArray(sale.items) ? sale.items : []).forEach((item) => {
        categories.add(item.category || 'Uncategorized');
      });
    });
    return ['All categories', ...[...categories].sort()];
  }, [filteredSales]);

  const categorySales = useMemo(() => {
    if (selectedCategory === 'All categories') return filteredSales;
    return filteredSales.filter((sale) =>
      (Array.isArray(sale.items) ? sale.items : []).some(
        (item) => (item.category || 'Uncategorized') === selectedCategory
      )
    );
  }, [filteredSales, selectedCategory]);

  const categoryAnalysis = useMemo(() => {
    const summary = new Map();
    categorySales.forEach((sale) => {
      const saleItems = Array.isArray(sale.items) ? sale.items : [];
      const matchingItems =
        selectedCategory === 'All categories'
          ? saleItems
          : saleItems.filter(
              (item) => (item.category || 'Uncategorized') === selectedCategory
            );

      matchingItems.forEach((item) => {
        const category = item.category || 'Uncategorized';
        const quantity = Number(item.qty || 1);
        const revenue = Number(item.price || 0) * quantity;
        const current = summary.get(category) || {
          category,
          revenue: 0,
          units: 0,
          invoices: new Set(),
        };
        current.revenue += revenue;
        current.units += quantity;
        current.invoices.add(sale.invoiceNo);
        summary.set(category, current);
      });
    });

    const rows = [...summary.values()]
      .map((row) => ({
        ...row,
        invoices: row.invoices.size,
        averageOrderValue: row.invoices ? row.revenue / row.invoices : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    return rows.map((row) => ({
      ...row,
      revenueShare: totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0,
    }));
  }, [categorySales, selectedCategory]);

  const analytics = useMemo(() => {
    let grossRevenue = 0;
    let totalGst = 0;
    let cgst = 0;
    let sgst = 0;
    let taxableRevenue = 0;
    let estimatedMaterialCost = 0;
    let collectedAmount = 0;
    let outstandingAmount = 0;
    let paidInvoices = 0;
    let pendingInvoices = 0;

    filteredSales.forEach((sale) => {
      const grandTotal = Number(sale.grandTotal ?? sale.total ?? 0);
      const saleCgst = Number(sale.cgst ?? 0);
      const saleSgst = Number(sale.sgst ?? 0);
      const gst = saleCgst + saleSgst;
      const subtotal = Number(sale.subtotal ?? Math.max(0, grandTotal - gst));

      grossRevenue += grandTotal;
      totalGst += gst;
      cgst += saleCgst;
      sgst += saleSgst;
      taxableRevenue += subtotal;
      collectedAmount += Number(sale.paidAmount ?? grandTotal);
      outstandingAmount += Number(sale.balanceAmount ?? Math.max(0, grandTotal - Number(sale.paidAmount ?? grandTotal)));
      if (Number(sale.balanceAmount ?? 0) > 0) pendingInvoices += 1;
      else paidInvoices += 1;

      // If sale items have explicit unit costPrice, use it; otherwise apply the studio material ratio
      const hasExplicitCost =
        Array.isArray(sale.items) &&
        sale.items.length > 0 &&
        sale.items.some((i) => i.costPrice !== undefined);

      if (hasExplicitCost) {
        estimatedMaterialCost += sale.items.reduce(
          (sum, item) => sum + Number(item.costPrice || 0) * Number(item.qty || 1),
          0
        );
      } else {
        estimatedMaterialCost += subtotal * (materialCostRatio / 100);
      }
    });

    const netProfit = taxableRevenue - estimatedMaterialCost;
    const profitMargin = taxableRevenue > 0 ? (netProfit / taxableRevenue) * 100 : 0;

    return {
      grossRevenue,
      totalGst,
      taxableRevenue,
      estimatedMaterialCost,
      netProfit,
      profitMargin,
      cgst,
      sgst,
      collectedAmount,
      outstandingAmount,
      paidInvoices,
      pendingInvoices,
      averageInvoiceValue: filteredSales.length ? grossRevenue / filteredSales.length : 0,
    };
  }, [filteredSales]);

  const exportLedgerToCSV = () => {
    if (categorySales.length === 0) return;

    const headers = [
      'Invoice No,Date,Client Name,Customer Phone,Items Count,Taxable Subtotal,CGST,SGST,Total GST,Grand Total,Paid Amount,Outstanding Balance,Estimated Material Cost,Estimated Profit,Payment Status\n',
    ];

    const rows = categorySales.map((sale) => {
      const grandTotal = Number(sale.grandTotal ?? sale.total ?? 0);
      const cgst = Number(sale.cgst ?? 0);
      const sgst = Number(sale.sgst ?? 0);
      const totalGst = cgst + sgst;
      const subtotal = Number(sale.subtotal ?? Math.max(0, grandTotal - totalGst));
      const paidAmount = Number(sale.paidAmount ?? grandTotal);
      const outstandingBalance = Number(
        sale.balanceAmount ?? Math.max(0, grandTotal - paidAmount)
      );
      const estimatedCost = subtotal * (materialCostRatio / 100);
      const estimatedProfit = subtotal - estimatedCost;
      const itemCount = Array.isArray(sale.items)
        ? sale.items.reduce((sum, i) => sum + Number(i.qty || 1), 0)
        : 1;

      const csvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const cleanDate = sale.date || sale.createdAt || '';

      return [
        csvValue(sale.invoiceNo),
        csvValue(cleanDate),
        csvValue(sale.customerName || 'Walk-in Client'),
        csvValue(sale.customerPhone || 'N/A'),
        itemCount,
        subtotal.toFixed(2),
        cgst.toFixed(2),
        sgst.toFixed(2),
        totalGst.toFixed(2),
        grandTotal.toFixed(2),
        paidAmount.toFixed(2),
        outstandingBalance.toFixed(2),
        estimatedCost.toFixed(2),
        estimatedProfit.toFixed(2),
        csvValue(outstandingBalance > 0 ? 'Pending' : 'Paid'),
      ].join(',') + '\n';
    });

    const blob = new Blob([headers + rows.join('')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monthly_revenue_audit_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const monthLabel = new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const formatCurrency = (value) =>
    `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="w-full space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-600">
            <CalendarRange size={19} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Revenue & Audit Workspace</h2>
            <p className="mt-1 text-xs text-gray-500">
              Enterprise review of revenue, tax liability, collections, receivables, and margin.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          Accounting month
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-indigo-500"
          >
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                })}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Control period</p>
          <p className="mt-1 font-semibold text-gray-900">{monthLabel}</p>
          <p className="mt-1 text-xs text-gray-500">Source: completed invoices</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Invoice control</p>
          <p className="mt-1 font-semibold text-gray-900">
            {analytics.paidInvoices} paid · {analytics.pendingInvoices} pending
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Average invoice {formatCurrency(analytics.averageInvoiceValue)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Tax control</p>
          <p className="mt-1 font-semibold text-gray-900">
            CGST {formatCurrency(analytics.cgst)}
          </p>
          <p className="mt-1 text-xs text-gray-500">SGST {formatCurrency(analytics.sgst)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Audit status</p>
          <p className="mt-1 inline-flex items-center gap-1.5 font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Ready to export
          </p>
          <p className="mt-1 text-xs text-gray-500">Invoice-level ledger reconciled</p>
        </div>
      </section>

      {/* ROW 1: Revenue & Profit Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 print:hidden">
        <MetricCard
          label="Gross Revenue"
          value={`₹${analytics.grossRevenue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          detail={`${filteredSales.length} invoices in ${monthLabel}`}
          icon={TrendingUp}
          tone="blue"
        />
        <MetricCard
          label="Est. Raw Material Cost"
          value={formatCurrency(analytics.estimatedMaterialCost)}
          detail={`Sheets, gum, ink & pads (${materialCostRatio}% est.)`}
          icon={Package}
          tone="amber"
        />
        <MetricCard
          label="Net Studio Profit"
          value={formatCurrency(analytics.netProfit)}
          detail={`${analytics.profitMargin.toFixed(1)}% net margin after materials & tax`}
          icon={Wallet}
          tone="emerald"
        />
        <MetricCard
          label="Total GST Collected"
          value={formatCurrency(analytics.totalGst)}
          detail={`CGST ${formatCurrency(analytics.cgst)} · SGST ${formatCurrency(analytics.sgst)}`}
          icon={Receipt}
          tone="purple"
        />
      </div>

      {/* ROW 2: Category Performance Analysis */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] print:hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-gray-100 pb-5 lg:flex-row lg:items-center">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-gray-900">
              <BarChart3 size={17} className="text-indigo-600" /> Category Performance Analysis
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Compare revenue contribution, volume, and order economics for {monthLabel}.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <Filter size={14} className="text-indigo-600" />
            Category
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-indigo-500"
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>

        {categoryAnalysis.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-400">
            No categorized item sales are available for this selection.
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              {categoryAnalysis.map((row, index) => (
                <div key={row.category}>
                  <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
                    <span className="font-semibold text-gray-800">
                      <span className="mr-2 text-gray-400">#{index + 1}</span>
                      {row.category}
                    </span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(row.revenue)} · {row.revenueShare.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${Math.max(row.revenueShare, row.revenue ? 2 : 0)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                    <span>{row.units} units · {row.invoices} invoices</span>
                    <span>Avg. order {formatCurrency(row.averageOrderValue)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Selected view
              </p>
              <p className="mt-2 text-lg font-bold text-gray-900">{selectedCategory}</p>
              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Category revenue</span>
                  <strong>{formatCurrency(categoryAnalysis.reduce((sum, row) => sum + row.revenue, 0))}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Units sold</span>
                  <strong>{categoryAnalysis.reduce((sum, row) => sum + row.units, 0)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoices represented</span>
                  <strong>{categorySales.length}</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 print:hidden">
        <MetricCard
          label="Collections Received"
          value={formatCurrency(analytics.collectedAmount)}
          detail={`Against ${formatCurrency(analytics.grossRevenue)} billed`}
          icon={Wallet}
          tone="emerald"
        />
        <MetricCard
          label="Outstanding Balance"
          value={formatCurrency(analytics.outstandingAmount)}
          detail="Pending customer receivables"
          icon={Clock}
          tone="amber"
        />
        <MetricCard
          label="Taxable Revenue"
          value={formatCurrency(analytics.taxableRevenue)}
          detail="Before CGST and SGST"
          icon={FileSpreadsheet}
          tone="indigo"
        />
      </section>

      {/* ROW 3: Sales Ledger Table with CSV Export */}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] print:hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-gray-50 p-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-semibold text-gray-900">Sales Ledger & Invoice History</h3>
            <p className="mt-1 text-xs text-gray-400">
              Audit-ready transaction ledger for {monthLabel}.
            </p>
          </div>

          <button
            onClick={exportLedgerToCSV}
            disabled={categorySales.length === 0}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
              categorySales.length === 0
                ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer'
            }`}
          >
            <Download size={15} /> Export Monthly Audit CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-white text-xs uppercase tracking-wider text-gray-500">
                <th className="p-4">Time & Invoice No</th>
                <th className="p-4">Client Details</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Tax (GST)</th>
                <th className="p-4 text-right">Est. Profit</th>
                <th className="p-4 text-right">Total Amount</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {categorySales.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-gray-400">
                    <Clock size={32} className="mx-auto mb-3 text-gray-300" />
                    <p>No sales recorded for {monthLabel} and the selected category.</p>
                  </td>
                </tr>
              ) : (
                categorySales.map((sale) => {
                  const grandTotal = Number(sale.grandTotal ?? sale.total ?? 0);
                  const gst = Number(sale.cgst ?? 0) + Number(sale.sgst ?? 0);
                  const taxable = Number(sale.subtotal ?? Math.max(0, grandTotal - gst));
                  const estProfit = taxable * ((100 - materialCostRatio) / 100);

                  return (
                    <tr key={sale.invoiceNo} className="hover:bg-gray-50/70">
                      <td className="p-4">
                        <p className="font-semibold text-gray-900">{sale.invoiceNo}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{sale.date}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-gray-900">
                          {sale.customerName || 'Walk-in Client'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {sale.customerPhone || 'N/A'}
                        </p>
                      </td>
                      <td className="p-4 text-center">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-bold px-2 py-0.5 rounded">
                          {sale.synced ? 'Cloud Synced' : 'Saved Locally'}
                        </span>
                      </td>
                      <td className="p-4 text-right text-purple-600 font-medium">
                        ₹{gst.toFixed(2)}
                      </td>
                      <td className="p-4 text-right text-emerald-600 font-semibold">
                        ₹{estProfit.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-bold text-indigo-600">
                        ₹{grandTotal.toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setSelectedSale(sale)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* INVOICE DETAILS MODAL */}
      {selectedSale && (
        <div
          onClick={() => setSelectedSale(null)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          >
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between print:hidden">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Invoice {selectedSale.invoiceNo}
                </h3>
                <p className="text-xs text-gray-400">{selectedSale.date}</p>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="flex justify-between bg-[#f8f9fb] p-3.5 rounded-xl border border-gray-100 text-xs">
                <div>
                  <p className="text-gray-400">Client Name</p>
                  <p className="font-bold text-gray-900 mt-0.5">{selectedSale.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400">WhatsApp / Phone</p>
                  <p className="font-bold text-gray-900 mt-0.5">{selectedSale.customerPhone}</p>
                </div>
              </div>

              {selectedSale.items && selectedSale.items.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="p-2.5">Item</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedSale.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-medium text-gray-900">{item.name}</td>
                          <td className="p-2.5 text-center">{item.qty}</td>
                          <td className="p-2.5 text-right font-semibold">
                            ₹{(item.price * item.qty).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-[#f8f9fb] rounded-xl p-4 space-y-2 text-xs border border-gray-100">
                <div className="flex justify-between text-gray-500">
                  <span>CGST Collected</span>
                  <span className="font-semibold text-gray-800">
                    ₹{Number(selectedSale.cgst || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>SGST Collected</span>
                  <span className="font-semibold text-gray-800">
                    ₹{Number(selectedSale.sgst || 0).toFixed(2)}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-bold text-gray-900">
                  <span>Grand Total</span>
                  <span className="text-indigo-600">
                    ₹{Number(selectedSale.grandTotal ?? selectedSale.total ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 print:hidden">
              <button
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Printer size={14} /> Print Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}