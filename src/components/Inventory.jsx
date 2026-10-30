// src/components/Inventory.jsx
import { useEffect, useMemo, useState, useRef } from 'react';
import { API_BASE_URL } from '../api';
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

function StatusBadge({ item }) {
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

export default function Inventory({ items, setItems, initialTab = 'overview' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editingItem, setEditingItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [movement, setMovement] = useState({ itemId: items[0]?.id || '', quantity: '' });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const lowStockItems = items.filter((item) => item.stock <= item.minStock);
  const totalUnits = items.reduce((sum, item) => sum + item.stock, 0);
  const totalValue = items.reduce((sum, item) => sum + item.stock * item.price, 0);

  const notify = (text) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 3000);
  };

  // --- DATABASE CONNECTED: Save / Update Item ---
  const saveItem = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const itemData = {
      name: String(form.get('name')).trim(),
      sku: String(form.get('sku')).trim().toUpperCase(),
      category: String(form.get('category')).trim() || 'General',
      price: Number(form.get('price')) || 0,
      stock: Number(form.get('stock')) || 0,
      minStock: Number(form.get('minStock')) || 5,
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
      const savedItem = await res.json();

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
  const handleImport = async (importedItems) => {
    try {
      // Save all imported items to SQLite via Express
      const savedItems = await Promise.all(importedItems.map(async (item) => {
        const { id, ...data } = item; // Omit ID so Prisma generates a true UUID
        const res = await fetch(`${API_BASE_URL}/api/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return await res.json();
      }));

      setItems((current) => [...current, ...savedItems]);
      notify(`Successfully imported ${savedItems.length} items to database.`);
    } catch (error) {
      console.error(error);
      notify('Error importing items to database.');
    }
  };

  // --- DATABASE CONNECTED: Delete Item ---
  const removeItem = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/api/items/${id}`, { method: 'DELETE' });
      setItems((current) => current.filter((item) => item.id !== id));
      notify('Item removed from database.');
    } catch (error) {
      console.error(error);
      notify('Error deleting item from database.');
    }
  };

  // --- DATABASE CONNECTED: Strictly Stock-In Only ---
  const recordStockIn = async (event) => {
    event.preventDefault();
    const quantity = Number(movement.quantity);
    const selectedItem = items.find((item) => item.id === movement.itemId);

    if (!selectedItem || quantity < 1) {
      notify('Enter a valid incoming stock quantity greater than zero.');
      return;
    }

    const newStock = selectedItem.stock + quantity;

    try {
      // Update the stock in the database
      await fetch(`${API_BASE_URL}/api/items/${selectedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock })
      });

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
          onDelete={removeItem}
          onImport={handleImport}
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
          onClose={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
          onSubmit={saveItem}
        />
      )}
    </div>
  );
}

function Overview({ items, lowStockItems, totalUnits, totalValue, onOpenTab }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total Items" value={items.length} detail="Active catalogue items" icon={Package} tone="indigo" />
        <MetricCard label="Units on Hand" value={totalUnits.toLocaleString()} detail="Across all locations" icon={Boxes} tone="blue" />
        <MetricCard label="Stock Value" value={`₹${totalValue.toLocaleString()}`} detail="Current retail value" icon={TrendingUp} tone="green" />
        <MetricCard label="Low Stock" value={lowStockItems.length} detail="Needs replenishment" icon={AlertTriangle} tone="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Stock health</h3>
              <p className="mt-1 text-xs text-gray-400">Items that need your attention</p>
            </div>
            <button onClick={() => onOpenTab('stock')} className="text-xs font-medium text-indigo-600 cursor-pointer">
              Add stock →
            </button>
          </div>
          {lowStockItems.length === 0 && (
            <p className="px-5 py-8 text-sm text-gray-400">All items are above their minimum stock level.</p>
          )}
          {lowStockItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between border-b border-gray-100 py-4 last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-50 p-2 text-red-500">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.name}</p>
                  <p className="text-xs text-gray-400">Minimum level: {item.minStock}</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-red-600">{item.stock} left</span>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Catalogue snapshot</h3>
              <p className="mt-1 text-xs text-gray-400">Current inventory mix</p>
            </div>
            <button onClick={() => onOpenTab('inventory')} className="text-xs font-medium text-indigo-600 cursor-pointer">
              View items →
            </button>
          </div>
          <div className="mt-5 space-y-4">
            {items.map((item) => (
              <div key={item.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-gray-600">{item.name}</span>
                  <span className="font-medium text-gray-800">{item.stock}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.min((item.stock / Math.max(totalUnits, 1)) * 300, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function InventoryManagement({ items, onAdd, onEdit, onDelete, onImport }) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const fileInputRef = useRef(null);

  const categories = ['All', ...new Set(items.map((item) => item.category))];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = `${item.name} ${item.sku}`.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, selectedCategory]);

  const exportToCSV = () => {
    const headers = ['Name,SKU,Category,Price,Stock,MinStock\n'];
    const rows = filteredItems.map(
      (item) => `"${item.name}","${item.sku}","${item.category}",${item.price},${item.stock},${item.minStock}\n`
    );
    const blob = new Blob([headers + rows.join('')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter((line) => line.trim() !== '');
      const parsedItems = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i]
          .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
          .map((s) => s.replace(/(^"|"$)/g, '').trim());
        if (row.length >= 6 && row[0] && row[1]) {
          parsedItems.push({
            name: row[0],
            sku: row[1].toUpperCase(),
            category: row[2] || 'General',
            price: Number(row[3]) || 0,
            stock: Number(row[4]) || 0,
            minStock: Number(row[5]) || 0,
          });
        }
      }
      if (parsedItems.length > 0) {
        onImport(parsedItems);
      } else {
        alert('Could not parse file. Ensure columns: Name, SKU, Category, Price, Stock, MinStock');
      }
    };
    reader.readAsText(file);
    event.target.value = null;
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col justify-between gap-4 border-b border-gray-100 p-6 md:flex-row md:items-start">
        <div>
          <h3 className="font-semibold text-gray-900">Inventory catalogue</h3>
          <p className="mt-1 text-xs text-gray-400">Create and maintain the items you sell.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
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

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-white text-xs uppercase tracking-wider text-gray-500">
              <th className="p-4">Item</th>
              <th className="p-4">SKU</th>
              <th className="p-4">Category</th>
              <th className="p-4">Price</th>
              <th className="p-4">Stock</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/70">
                <td className="p-4 font-medium text-gray-900">{item.name}</td>
                <td className="p-4 text-gray-500">{item.sku}</td>
                <td className="p-4 text-gray-500">{item.category}</td>
                <td className="p-4">₹{item.price.toLocaleString()}</td>
                <td className="p-4 font-medium">{item.stock}</td>
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
    </section>
  );
}

function StockManagement({ items, movement, setMovement, onSubmit }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <h3 className="font-semibold text-gray-900">Receive Incoming Stock (Stock In Only)</h3>
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
            <select
              value={movement.itemId}
              onChange={(event) => setMovement({ ...movement, itemId: event.target.value })}
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none cursor-pointer"
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.stock} currently in stock)
                </option>
              ))}
            </select>
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
            <h3 className="font-semibold text-gray-900">Current stock levels</h3>
            <p className="mt-1 text-xs text-gray-400">Use the minimum level to plan replenishment.</p>
          </div>
          <Boxes size={20} className="text-indigo-500" />
        </div>
        <div className="mt-5 space-y-4">
          {items.map((item) => (
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
        </div>
      </section>
    </div>
  );
}

function ItemForm({ item, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {item ? 'Edit item' : 'Add inventory item'}
            </h3>
            <p className="mt-1 text-xs text-gray-400">Keep your catalogue details up to date.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700 cursor-pointer">
            Close
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Item name
            <input
              name="name"
              required
              defaultValue={item?.name || ''}
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            SKU
            <input
              name="sku"
              required
              defaultValue={item?.sku || ''}
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm uppercase outline-none"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Category
            <input
              name="category"
              defaultValue={item?.category || ''}
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Price
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={item?.price || ''}
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Opening stock
            <input
              name="stock"
              type="number"
              min="0"
              required
              defaultValue={item?.stock ?? ''}
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Minimum stock alert level
            <input
              name="minStock"
              type="number"
              min="0"
              required
              defaultValue={item?.minStock ?? ''}
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none"
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 cursor-pointer">
            Cancel
          </button>
          <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer">
            {item ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </form>
    </div>
  );
}