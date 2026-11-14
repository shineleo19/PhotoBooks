// src/components/Inventory.jsx
import { useEffect, useMemo, useState, useRef } from 'react';
import { API_BASE_URL } from '../api';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  Edit,
  Package,
  PackagePlus,
  Search,
  Trash2,
  TrendingUp,
  Download,
  Upload,
  Filter,
  ShieldAlert,
} from 'lucide-react';
import { rankItems } from '../utils/itemSearch';

const isPieceUnit = (unit) => /^pieces?$/i.test(String(unit || '').trim());
const tracksStock = (item) =>
  item.stockTracked !== false &&
  Number(item.stockTracked) !== 0 &&
  !item.isPackage &&
  (!item.baseUnit || isPieceUnit(item.baseUnit));

function StatusBadge({ item }) {
  if (!tracksStock(item)) {
    return (
      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
        Not tracked
      </span>
    );
  }
  const isLow = item.stock <= item.minStock;
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-medium ${
        isLow ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
      }`}
    >
      {isLow ? 'Low Stock' : 'In Stock'}
    </span>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
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

export default function Inventory({ items, setItems, initialTab = 'overview', onNotify }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editingItem, setEditingItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [movement, setMovement] = useState({
    itemId: items.find(tracksStock)?.id || '',
    quantity: '',
  });
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const lowStockItems = items.filter(
    (item) => tracksStock(item) && item.stock <= item.minStock
  );
  const totalUnits = items.reduce(
    (sum, item) => sum + (tracksStock(item) ? item.stock : 0),
    0
  );
  const totalValue = items.reduce(
    (sum, item) => sum + (tracksStock(item) ? item.stock * item.price : 0),
    0
  );

  const notify = (text) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 3000);
    onNotify?.('Inventory update', text, 'info');
  };

  // --- DATABASE CONNECTED: Save / Update Item ---
  const saveItem = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const isPackage = form.get('itemType') === 'package';
    const baseUnit = isPackage
      ? 'Package'
      : form.get('baseUnit') === 'Pieces'
        ? 'Pieces'
        : editingItem && !editingItem.isPackage && !isPieceUnit(editingItem.baseUnit)
          ? editingItem.baseUnit
          : 'Other';
    const stockTracked = !isPackage && isPieceUnit(baseUnit);
    const quantities = form.getAll('consumptionQuantity');
    const materials = form
      .getAll('materialItemId')
      .map((materialItemId, index) => ({
        materialItemId,
        quantity: Number(quantities[index]) || 0,
      }))
      .filter((material) => material.materialItemId && material.quantity > 0);
    if (isPackage && materials.length === 0) {
      notify('Add at least one product to the package.');
      return;
    }
    const itemData = {
      name: String(form.get('name')).trim(),
      sku: String(form.get('sku')).trim().toUpperCase(),
      category: isPackage ? 'Package' : String(form.get('category')).trim() || 'General',
      price: Number(form.get('price')) || 0,
      gstRate: Number(form.get('gstRate')) || 0,
      baseUnit,
      stock: stockTracked ? Number(form.get('stock')) || 0 : 0,
      minStock: stockTracked ? Math.max(0, Number(form.get('minStock')) || 0) : 0,
      stockTracked,
      isPackage,
      materials,
    };

    try {
      const method = editingItem ? 'PUT' : 'POST';
      const url = editingItem 
        ? `${API_BASE_URL}/api/items/${editingItem.id}`
        : `${API_BASE_URL}/api/items`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });
      const savedItem = await res.json().catch(() => ({}));
      if (!res.ok || !savedItem.id) {
        throw new Error(savedItem.error || 'Unable to save the inventory item.');
      }

      setItems((current) =>
        editingItem
          ? current.map((currentItem) => (currentItem.id === savedItem.id ? savedItem : currentItem))
          : [...current, savedItem]
      );
      setEditingItem(null);
      setShowForm(false);
      notify(editingItem ? 'Item updated in database.' : 'Item added to database.');
    } catch (error) {
      console.error(error);
      notify('Error saving item to database.');
    }
  };

  // --- DATABASE CONNECTED: Bulk Import CSV ---
  const handleImport = async (importedItems, existingAction = 'add') => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/items/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importedItems, existingAction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'The inventory import failed.');
      }

      setItems((current) => {
        const importedById = new Map(data.items.map((item) => [item.id, item]));
        const importedSkus = new Set(data.items.map((item) => item.sku));
        return [
          ...current.filter((item) => !importedSkus.has(item.sku)),
          ...Array.from(importedById.values()),
        ];
      });
      notify(
        `Imported ${data.importedNewItems} new items, updated ${data.updatedExistingItems}, and ignored ${data.ignoredItems}.`
      );
      return data;
    } catch (error) {
      console.error(error);
      notify(`Import failed: ${error.message}`);
      throw error;
    }
  };

  // --- DATABASE CONNECTED: Delete Item ---
  const removeItem = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/items/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to remove the inventory item.');
      }
      setItems((current) => current.filter((item) => item.id !== id));
      notify('Item removed from database.');
    } catch (error) {
      console.error(error);
      notify('Error deleting item from database.');
    }
  };

  const linkedBy = deleteTarget
    ? items.filter((item) =>
        item.linkedMaterials?.some((linked) => linked.id === deleteTarget.id)
      )
    : [];

  // --- DATABASE CONNECTED: Strictly Stock-In Only ---
  const recordStockIn = async (event) => {
    event.preventDefault();
    const quantity = Number(movement.quantity);
    const selectedItem = items.find((item) => item.id === movement.itemId);

    if (!selectedItem || !tracksStock(selectedItem) || quantity < 1) {
      notify('Enter a valid incoming stock quantity greater than zero.');
      return;
    }

    const newStock = selectedItem.stock + quantity;

    try {
      // Update the stock in the database
      const res = await fetch(`${API_BASE_URL}/api/items/${selectedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock })
      });
      const savedItem = await res.json().catch(() => ({}));
      if (!res.ok || !savedItem.id) {
        throw new Error(savedItem.error || 'Unable to update stock.');
      }

      setItems((current) =>
        current.map((item) =>
          item.id === movement.itemId ? { ...item, stock: newStock } : item
        )
      );
      setMovement((current) => ({ ...current, quantity: '' }));
      notify(`Added +${quantity} units to ${selectedItem.name}.`);
    } catch (error) {
      console.error(error);
      notify('Error updating stock in database.');
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Sub-navigation Switcher */}
      <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-gray-200 w-fit">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'inventory', label: 'Inventory Catalogue' },
          { id: 'stock', label: 'Receive Stock (Stock In)' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-6 py-4 text-sm text-indigo-700 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          {notice}
        </div>
      )}

      {activeTab === 'overview' && (
        <Overview
          items={items}
          lowStockItems={lowStockItems}
          totalUnits={totalUnits}
          totalValue={totalValue}
          onOpenTab={setActiveTab}
          onRestock={(itemId) => {
            setMovement((current) => ({ ...current, itemId, quantity: '' }));
            setActiveTab('stock');
          }}
        />
      )}

      {activeTab === 'inventory' && (
        <InventoryManagement
          items={items}
          onAdd={() => {
            setEditingItem(null);
            setShowForm(true);
          }}
          onEdit={(item) => {
            setEditingItem(item);
            setShowForm(true);
          }}
          onDelete={(id) => setDeleteTarget(items.find((item) => item.id === id) || null)}
          onImport={handleImport}
          existingItems={items}
        />
      )}

      {activeTab === 'stock' && (
        <StockManagement
          items={items}
          movement={movement}
          setMovement={setMovement}
          onSubmit={recordStockIn}
        />
      )}

      {showForm && (
        <ItemForm
          item={editingItem}
          items={items}
          onClose={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
          onSubmit={saveItem}
        />
      )}
      {deleteTarget && (
        <DeleteItemDialog
          item={deleteTarget}
          linkedBy={linkedBy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await removeItem(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function Overview({ items, lowStockItems, totalUnits, totalValue, onOpenTab, onRestock }) {
  const [stockHealthSearch, setStockHealthSearch] = useState('');
  const [stockHealthFilter, setStockHealthFilter] = useState('all');
  const stockTrackedItemCount = items.filter(tracksStock).length;
  const printPackageItemCount = items.length - stockTrackedItemCount;
  const outOfStockCount = lowStockItems.filter((item) => Number(item.stock) === 0).length;
  const belowMinimumCount = lowStockItems.length - outOfStockCount;
  const filteredLowStockItems = useMemo(() => {
    const query = stockHealthSearch.trim().toLowerCase();
    return lowStockItems.filter((item) => {
      const quantity = Number(item.stock) || 0;
      const matchesFilter =
        stockHealthFilter === 'out'
          ? quantity === 0
          : stockHealthFilter === 'low'
            ? quantity > 0 && quantity <= Number(item.minStock || 0)
            : true;
      const matchesSearch = !query ||
        `${item.name} ${item.sku || ''}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [lowStockItems, stockHealthFilter, stockHealthSearch]);
  const snapshotItems = [...items].sort((a, b) => {
    const stockA = Number(a.stock) || 0;
    const stockB = Number(b.stock) || 0;
    if ((stockA > 0) !== (stockB > 0)) return stockA > 0 ? -1 : 1;
    const valueA = stockA * (Number(a.price) || 0);
    const valueB = stockB * (Number(b.price) || 0);
    return valueB - valueA || stockB - stockA;
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Total Items"
          value={items.length}
          detail={`${stockTrackedItemCount} stock-tracked · ${printPackageItemCount} print/packages`}
          icon={Package}
          tone="indigo"
        />
        <MetricCard label="Units on Hand" value={totalUnits.toLocaleString()} detail="Across all locations" icon={Boxes} tone="blue" />
        <MetricCard label="Stock Value" value={`₹${totalValue.toLocaleString()}`} detail="Current retail value" icon={TrendingUp} tone="green" />
        <MetricCard
          label="Low Stock"
          value={lowStockItems.length}
          detail={`${outOfStockCount} out of stock · ${belowMinimumCount} below minimum`}
          icon={AlertTriangle}
          tone="red"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Stock health</h3>
                <p className="mt-1 text-xs text-gray-400">Items that need your attention</p>
              </div>
              <button onClick={() => onOpenTab('stock')} className="text-xs font-medium text-indigo-600 cursor-pointer">
                Add stock →
              </button>
            </div>
            <input
              type="search"
              value={stockHealthSearch}
              onChange={(event) => setStockHealthSearch(event.target.value)}
              placeholder="Search low/out-of-stock item..."
              aria-label="Search low or out-of-stock item"
              className="w-full rounded-lg border border-gray-200 bg-[#f8f9fb] px-3 py-2 text-xs outline-none focus:border-indigo-500"
            />
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All' },
                { id: 'out', label: 'Out of Stock' },
                { id: 'low', label: 'Low Stock' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStockHealthFilter(filter.id)}
                  aria-pressed={stockHealthFilter === filter.id}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    stockHealthFilter === filter.id
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-96 min-h-0 overflow-y-auto">
            {lowStockItems.length === 0 && (
              <p className="px-5 py-8 text-sm text-gray-400">All items are above their minimum stock level.</p>
            )}
            {filteredLowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-4 last:border-b-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 rounded-lg bg-red-50 p-2 text-red-500">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-400">Minimum level: {item.minStock}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-red-600">{item.stock} left</span>
                  <button
                    type="button"
                    onClick={() => onRestock(item.id)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    + Restock
                  </button>
                </div>
              </div>
            ))}
            {lowStockItems.length > 0 && filteredLowStockItems.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-gray-400">
                No stock health items match this search and filter.
              </p>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <div className="flex shrink-0 items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Catalogue snapshot</h3>
              <p className="mt-1 text-xs text-gray-400">Current inventory mix</p>
            </div>
            <button onClick={() => onOpenTab('inventory')} className="text-xs font-medium text-indigo-600 cursor-pointer">
              View items →
            </button>
          </div>
          <div className="mt-5 max-h-96 min-h-0 overflow-y-auto">
            <div className="space-y-4">
              {snapshotItems.map((item) => {
                const quantity = Number(item.stock) || 0;
                const isPackage = item.isPackage === true || Number(item.isPackage) === 1;
                const showPrice = isPackage || !tracksStock(item) || quantity === 0;
                return (
                  <div key={item.id}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="min-w-0 truncate pr-2 text-gray-600">{item.name}</span>
                      <span className="flex shrink-0 items-center gap-2 font-medium text-gray-800">
                        {quantity}
                        {showPrice && (
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                            ₹{(Number(item.price) || 0).toFixed(2)}
                          </span>
                        )}
                      </span>
                    </div>
                    {quantity > 0 && (
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.min((quantity / Math.max(totalUnits, 1)) * 300, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InventoryManagement({ items, onAdd, onEdit, onDelete, onImport, existingItems }) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const fileInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importAction, setImportAction] = useState('add');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const categories = ['All', ...new Set(items.map((item) => item.category))];

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) =>
      selectedCategory === 'All' || item.category === selectedCategory
    );
    return rankItems(filtered, search);
  }, [items, search, selectedCategory]);

  const exportToCSV = () => {
    try {
      const headers = ['Name,SKU,Category,Price,GSTRate,Stock,MinStock,Base Unit,StockTracked,LinkedItems\n'];
      const rows = filteredItems.map(
        (item) =>
          `"${item.name}","${item.sku}","${item.category}",${item.price},${item.gstRate ?? 18},${item.stock},${item.minStock},"${item.baseUnit || (tracksStock(item) ? 'Pieces' : 'Other')}",${tracksStock(item)},"${(item.linkedMaterials || []).map((linked) => `${linked.name} x ${linked.quantity}`).join('; ')}"\n`
      );
      const blob = new Blob([headers + rows.join('')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Inventory export failed:', error);
      alert('Could not export inventory. Please try again.');
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const parsedItems = rows
          .map((row, index) => {
            const value = (...keys) => {
              const key = keys.find((candidate) =>
                Object.prototype.hasOwnProperty.call(row, candidate)
              );
              return key ? row[key] : '';
            };
            const taxText = String(value('GSTRate', 'Tax Rate', 'GST', 'Tax')).trim();
            const taxMatch = taxText.match(/-?\d+(?:\.\d+)?/);
            const rawSku = String(value('SKU', 'Item code', 'Item Code')).trim();
            const rawName = String(value('Name', 'Item name*', 'Item name')).trim();
            if (!rawName) return null;

            const baseUnit = String(value('Base Unit (x)', 'Base Unit', 'Unit')).trim();
            return {
              name: rawName,
              sku: (rawSku || `IMPORT-${Date.now()}-${index}`).toUpperCase(),
              category: String(value('Category', 'category')).trim() || 'General',
              price: Number(value('Price', 'Sale price')) || 0,
              gstRate: taxMatch ? Number(taxMatch[0]) : 18,
              baseUnit: baseUnit || 'Other',
              stock: isPieceUnit(baseUnit) ? Math.max(0, Number(value('Stock', 'Current stock quantity')) || 0) : 0,
              minStock: isPieceUnit(baseUnit) ? Math.max(0, Number(value('MinStock', 'Minimum stock quantity')) || 0) : 0,
              stockTracked: isPieceUnit(baseUnit),
            };
          })
          .filter(Boolean);

        if (parsedItems.length > 0) {
          const existingByKey = new Map();
          existingItems.forEach((item) => {
            existingByKey.set(item.sku?.trim().toUpperCase(), item);
            existingByKey.set(item.name.trim().toLowerCase(), item);
          });
          const existing = [];
          const newItems = [];
          parsedItems.forEach((item) => {
            const match =
              existingByKey.get(item.sku) || existingByKey.get(item.name.toLowerCase());
            (match ? existing : newItems).push({
              ...item,
              existingItem: match || null,
            });
          });
          setImportResult(null);
          setImportAction('add');
          setImportPreview({
            totalRows: parsedItems.length,
            newItems,
            existingItems: existing,
          });
        } else {
          alert('Could not parse file. Ensure it contains item name and sale price columns.');
        }
      } catch (error) {
        console.error('Inventory import parsing failed:', error);
        alert('Could not read the spreadsheet. Please verify that it is a valid Excel file.');
      }
    };
    reader.onerror = () => {
      console.error('Inventory import file read failed:', reader.error);
      alert('Could not read the selected file.');
    };
    reader.readAsArrayBuffer(file);
    event.target.value = null;
  };

  const confirmImport = async () => {
    if (!importPreview || importing) return;
    setImporting(true);
    try {
      const data = await onImport(
        [...importPreview.newItems, ...importPreview.existingItems].map(
          ({ existingItem, ...item }) =>
            existingItem ? { ...item, sku: existingItem.sku } : item
        ),
        importAction
      );
      setImportResult(data);
    } catch {
      setImportResult({ failedItems: importPreview.totalRows });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col justify-between gap-4 border-b border-gray-100 p-6 md:flex-row md:items-start">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-gray-900">
            <Package size={18} className="text-indigo-600" /> Inventory catalogue
          </h3>
          <p className="mt-1 text-xs text-gray-400">Create and maintain the items you sell.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current.click()}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            <Upload size={16} /> Import
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            <Download size={16} /> Export
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
          >
            <PackagePlus size={16} /> Add Item
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-gray-50 bg-gray-50/50 p-4 sm:flex-row">
        <div className="flex flex-1 items-center rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <Search size={17} className="mr-2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or SKU..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm sm:w-64">
          <Filter size={17} className="mr-2 text-gray-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-transparent text-sm outline-none text-gray-700"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-white text-xs uppercase tracking-wider text-gray-500">
              <th className="p-4">Item</th>
              <th className="p-4">Price</th>
              <th className="p-4">Stock</th>
              <th className="p-4">Linked Material</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/70">
                <td className="p-4 font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    <span>{item.name}</span>
                    {item.isPackage === 1 && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                        Package
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-4">₹{item.price.toLocaleString()}</td>
                <td className="p-4 font-medium">
                  {tracksStock(item) ? `${item.stock} ${item.baseUnit || 'Pieces'}` : '—'}
                </td>
                <td className="p-4 text-xs text-gray-500">
                  {item.linkedMaterials?.length
                    ? item.linkedMaterials.map((material) => (
                      <div key={material.id}>Uses: {material.name} × {material.quantity}</div>
                    ))
                    : '—'}
                </td>
                <td className="p-4">
                  <StatusBadge item={item} />
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-3 text-gray-400">
                    <button onClick={() => onEdit(item)} title="Edit item" className="hover:text-indigo-600 cursor-pointer">
                      <Edit size={17} />
                    </button>
                    <button onClick={() => onDelete(item.id)} title="Delete item" className="hover:text-red-500 cursor-pointer">
                      <Trash2 size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          action={importAction}
          setAction={setImportAction}
          importing={importing}
          result={importResult}
          onConfirm={confirmImport}
          onClose={() => {
            if (!importing) {
              setImportPreview(null);
              setImportResult(null);
            }
          }}
        />
      )}
    </section>
  );
}

function ImportPreviewDialog({
  preview,
  action,
  setAction,
  importing,
  result,
  onConfirm,
  onClose,
}) {
  const duplicatePreview = preview.existingItems.slice(0, 5);
  const resultShown = result && typeof result.importedNewItems === 'number';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900">
          {resultShown ? 'Import complete' : 'Review inventory import'}
        </h3>
        {!resultShown ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ['Total Rows', preview.totalRows],
                ['New Items', preview.newItems.length],
                ['Existing Items', preview.existingItems.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            {duplicatePreview.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold text-gray-800">Duplicate preview</p>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="p-3">Item Name</th>
                        <th className="p-3">Current Stock</th>
                        <th className="p-3">Imported Stock</th>
                        <th className="p-3">Resulting Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicatePreview.map((item) => (
                        <tr key={`${item.sku}-${item.name}`} className="border-t border-gray-100">
                          <td className="p-3">{item.name}</td>
                          <td className="p-3">{item.existingItem?.stock ?? 0}</td>
                          <td className="p-3">{item.stock}</td>
                          <td className="p-3">
                            {action === 'add'
                              ? (item.existingItem?.stock ?? 0) + item.stock
                              : action === 'ignore'
                                ? item.existingItem?.stock ?? 0
                                : item.stock}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {preview.existingItems.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-sm font-semibold text-gray-800">Existing item action</p>
                {[
                  ['add', 'Add imported quantity to existing stock (recommended)'],
                  ['ignore', 'Ignore existing items'],
                  ['overwrite', 'Overwrite existing item data'],
                ].map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="import-action"
                      value={value}
                      checked={action === value}
                      onChange={(event) => setAction(event.target.value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={importing}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import items'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 space-y-2 text-sm text-gray-700">
              <p>Imported New Items: {result.importedNewItems}</p>
              <p>Updated Existing Items: {result.updatedExistingItems}</p>
              <p>Ignored Items: {result.ignoredItems}</p>
              <p>Failed Items: {result.failedItems}</p>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={onClose} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StockManagement({ items, movement, setMovement, onSubmit }) {
  const [stockSearch, setStockSearch] = useState('');
  const [receivingItemSearch, setReceivingItemSearch] = useState('');
  const stockTrackedItems = useMemo(() => items.filter(tracksStock), [items]);
  const filteredStockItems = useMemo(() => {
    const query = stockSearch.trim().toLowerCase();
    if (!query) return stockTrackedItems;
    return stockTrackedItems.filter((item) =>
      `${item.name} ${item.sku || ''}`.toLowerCase().includes(query)
    );
  }, [stockTrackedItems, stockSearch]);
  const filteredReceivingItems = useMemo(() => {
    const query = receivingItemSearch.trim().toLowerCase();
    if (!query) return stockTrackedItems;
    return stockTrackedItems.filter((item) =>
      `${item.name} ${item.sku || ''}`.toLowerCase().includes(query)
    );
  }, [stockTrackedItems, receivingItemSearch]);
  const selectedReceivingItem = stockTrackedItems.find((item) => item.id === movement.itemId);

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
          <ArrowDownToLine size={18} className="text-emerald-600" /> Receive Incoming Stock (Stock In Only)
        </h3>
        <p className="mt-1 text-xs text-gray-400">
          Add new supplier deliveries here. Stock reductions happen automatically during Billing.
        </p>

        {/* Policy Notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-xs text-amber-800">
          <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <span>
            <strong>Stock Out Locked:</strong> Workers cannot manually deduct stock here. Stock is reduced only when a GST Bill is printed.
          </span>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Select Item
            <div className="relative mt-1.5">
              <div className="flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                <Search size={16} className="mr-2 shrink-0 text-gray-400" />
                <input
                  value={receivingItemSearch}
                  onChange={(event) => setReceivingItemSearch(event.target.value)}
                  placeholder={selectedReceivingItem?.name || 'Search item or SKU...'}
                  className="w-full bg-transparent text-sm outline-none"
                  aria-label="Search incoming stock item"
                />
              </div>
              <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                {filteredReceivingItems.length > 0 ? (
                  filteredReceivingItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMovement({ ...movement, itemId: item.id });
                        setReceivingItemSearch('');
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                        item.id === movement.itemId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {item.name}
                        {item.sku ? <span className="ml-1 text-xs text-gray-400">({item.sku})</span> : null}
                      </span>
                      <span className="ml-3 shrink-0 text-xs text-gray-400">{item.stock} in stock</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-gray-400">No matching items</p>
                )}
              </div>
              {selectedReceivingItem && (
                <p className="mt-1 text-xs text-gray-400">
                  Selected: {selectedReceivingItem.name} ({selectedReceivingItem.stock} currently in stock)
                </p>
              )}
            </div>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Incoming Quantity to Add (+)
            <input
              type="number"
              min="1"
              value={movement.quantity}
              onChange={(event) => setMovement({ ...movement, quantity: event.target.value })}
              placeholder="Enter incoming units received"
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none"
            />
          </label>

          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors cursor-pointer">
            <ArrowDownToLine size={17} /> Add Stock to Inventory
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-gray-900">
              <Boxes size={18} className="text-indigo-600" /> Current stock levels
            </h3>
            <p className="mt-1 text-xs text-gray-400">Use the minimum level to plan replenishment.</p>
          </div>
          <Boxes size={20} className="text-indigo-500" />
        </div>
        <div className="mt-4 flex items-center rounded-xl border border-gray-200 bg-[#f8f9fb] px-3 py-2">
          <Search size={16} className="mr-2 text-gray-400" />
          <input
            value={stockSearch}
            onChange={(event) => setStockSearch(event.target.value)}
            placeholder="Search item or SKU..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="mt-5 max-h-[520px] space-y-4 overflow-y-auto pr-1">
          {filteredStockItems.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-100 bg-[#f8f9fa] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    SKU {item.sku} · Minimum {item.minStock}
                  </p>
                </div>
                <StatusBadge item={item} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${
                      item.stock <= item.minStock ? 'bg-red-500' : 'bg-green-500'
                    }`}
                    style={{
                      width: `${Math.min((item.stock / Math.max(item.minStock * 3, 1)) * 100, 100)}%`,
                    }}
                  />
                </div>
                <span className="w-16 text-right text-sm font-semibold text-gray-800">
                  {item.stock} units
                </span>
              </div>
            </div>
          ))}
          {filteredStockItems.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">
              No matching stock items found.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function LinkedItemSearch({ items, value, onChange, name }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = items.find((item) => item.id === value);
  const results = useMemo(() => rankItems(items, query).slice(0, 20), [items, query]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <input type="hidden" name={name} value={value} />
      <input
        value={open ? query : selected?.name || ''}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value) onChange('');
        }}
        onFocus={() => setOpen(true)}
        placeholder={selected?.name || 'Search inventory item'}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onMouseDown={() => {
                onChange(result.id);
                setQuery('');
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-indigo-50 ${
                result.id === value ? 'bg-indigo-50 text-indigo-700' : ''
              }`}
            >
              <span className="font-medium">{result.name}</span>
              <span className="ml-2 text-xs text-gray-400">{result.sku}</span>
            </button>
          ))}
          {results.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">No matching items</p>}
        </div>
      )}
    </div>
  );
}

function DeleteItemDialog({ item, linkedBy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const [removing, setRemoving] = useState(false);
  useEffect(() => {
    cancelRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter' && document.activeElement?.tagName === 'BUTTON') {
        document.activeElement.click();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-item-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 id="delete-item-title" className="text-lg font-semibold text-gray-900">Delete Item</h3>
        <p className="mt-4 text-sm text-gray-600">Item: <strong>{item.name}</strong></p>
        {linkedBy.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p>This item is currently linked to:</p>
            <ul className="mt-2 list-disc pl-5">
              {linkedBy.map((linkedItem) => <li key={linkedItem.id}>{linkedItem.name}</li>)}
            </ul>
            <p className="mt-3">Deleting this item will remove these links.</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">This action cannot be undone.</p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              try { await onConfirm(); } finally { setRemoving(false); }
            }}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {removing ? 'Deleting...' : linkedBy.length ? 'Delete Item And Remove Links' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemForm({ item, items, onClose, onSubmit }) {
  const linkedItems = items.filter((candidate) => candidate.id !== item?.id);
  const [formTab, setFormTab] = useState(item?.isPackage ? 'package' : 'item');
  const [baseUnit, setBaseUnit] = useState(
    item?.isPackage ? 'Pieces' : item?.baseUnit || (tracksStock(item || {}) ? 'Pieces' : 'Other')
  );
  const stockTracked = formTab === 'item' && isPieceUnit(baseUnit);
  const [materialRows, setMaterialRows] = useState(
    item?.linkedMaterials?.length
      ? item.linkedMaterials.map((material) => ({ id: material.id, quantity: material.quantity }))
      : [{ id: '', quantity: 1 }]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3 sm:p-4">
      <form
        onSubmit={onSubmit}
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{item ? 'Edit item' : 'Add inventory item'}</h3>
            <p className="mt-0.5 text-xs text-gray-400">Keep your catalogue details up to date.</p>
          </div>
          <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer">Close</button>
        </div>
        <div className="mt-3 flex gap-1 rounded-lg bg-gray-100 p-0.5">
          {[
            { id: 'item', label: 'Normal item' },
            { id: 'package', label: 'Package (Combo pack)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFormTab(tab.id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                formTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="itemType" value={formTab} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-gray-700 sm:col-span-2">
            {formTab === 'package' ? 'Package name' : 'Item name'}
            <input name="name" required defaultValue={item?.name || ''} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none" />
          </label>
          <label className="text-xs font-medium text-gray-700">
            SKU <span className="text-xs font-normal text-gray-400">(optional)</span>
            <input name="sku" defaultValue={item?.sku || ''} placeholder="Auto-generated if blank" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase outline-none" />
          </label>
          {formTab === 'item' && <label className="text-xs font-medium text-gray-700">
            Category
            <input name="category" defaultValue={item?.category || ''} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none" />
          </label>}
          {formTab === 'item' && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-700">Base unit</p>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="baseUnit"
                  value="Pieces"
                  checked={isPieceUnit(baseUnit)}
                  onChange={(event) =>
                    setBaseUnit(event.target.checked ? 'Pieces' : 'Other')
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Pieces
              </label>
              <p className="text-[11px] text-gray-400">
                {stockTracked
                  ? 'Opening stock and low-stock alerts are enabled.'
                  : 'Opening stock and low-stock alerts are disabled.'}
              </p>
            </div>
          )}
          <label className="text-xs font-medium text-gray-700">
            Selling price
            <input name="price" type="number" min="0" step="0.01" required defaultValue={item?.price || ''} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none" />
          </label>
          <label className="text-xs font-medium text-gray-700">
            GST rate (%)
            <input name="gstRate" type="number" min="0" max="100" step="0.01" required defaultValue={item?.gstRate ?? 18} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none" />
          </label>
          {stockTracked && <label className="text-xs font-medium text-gray-700">
            Opening stock
            <input name="stock" type="number" min="0" required defaultValue={item?.stock ?? ''} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none" />
          </label>}
          {stockTracked && <label className="text-xs font-medium text-gray-700">
            Minimum stock alert level
            <input name="minStock" type="number" min="0" required defaultValue={item?.minStock ?? ''} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none" />
          </label>}
          <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  {formTab === 'package' ? 'Products in this package' : 'Linked materials (optional)'}
                </p>
                <button type="button" onClick={() => setMaterialRows((current) => [...current, { id: '', quantity: 1 }])} className="text-[11px] font-semibold text-indigo-600">Add material</button>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {materialRows.map((row, index) => (
                  <div key={index} className="flex gap-2">
                    <LinkedItemSearch
                      name="materialItemId"
                      items={linkedItems}
                      value={row.id}
                      onChange={(id) => setMaterialRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, id } : entry))}
                    />
                    <input name="consumptionQuantity" type="number" min="0.001" step="0.001" value={row.quantity} onChange={(event) => setMaterialRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, quantity: event.target.value } : entry))} className="w-24 rounded-lg border border-gray-200 px-2 py-2 text-sm outline-none" aria-label="Consumption quantity" />
                    {materialRows.length > 1 && <button type="button" onClick={() => setMaterialRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="px-1.5 text-xs text-red-500">Remove</button>}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">
                {formTab === 'package'
                  ? 'Package stock is not tracked; billing deducts the linked products.'
                  : "When billed, linked materials are deducted instead of this item's own stock."}
              </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer">Cancel</button>
          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 cursor-pointer">{item ? 'Save changes' : 'Add item'}</button>
        </div>
      </form>
    </div>
  );
}