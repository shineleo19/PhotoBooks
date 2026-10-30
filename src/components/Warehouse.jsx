// src/components/Warehouse.jsx
import { useState, useMemo } from 'react';
import { API_BASE_URL } from '../api';
import {
  Building2,
  Boxes,
  Layers,
  Droplets,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Plus,
  PackageCheck,
  Sparkles,
} from 'lucide-react';

function MetricCard({ label, value, detail, icon: Icon, tone }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
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

const STUDIO_ZONES = [
  {
    id: 'Paper & Sheets',
    name: 'Zone A — Paper & Sheets Rack',
    code: 'RACK-A01',
    capacity: 400,
    tempNote: 'Humidity Controlled (45% RH)',
    description: 'High-gloss print papers, PVC inner sheets, metallic & matte rolls.',
    icon: Layers,
    tone: 'blue',
  },
  {
    id: 'Binding & Adhesives',
    name: 'Zone B — Binding & Adhesives Bay',
    code: 'BAY-B02',
    capacity: 150,
    tempNote: 'Cool Dry Storage (< 28°C)',
    description: 'Synthetic binding gum cans, double-sided red tapes, lamination films.',
    icon: Sparkles,
    tone: 'amber',
  },
  {
    id: 'Printer Inks',
    name: 'Zone C — Printer Inks & Consumables',
    code: 'CAB-C03',
    capacity: 80,
    tempNote: 'UV-Protected Cabinet',
    description: '6-color photo ink sets, maintenance tanks, printhead cleaning fluids.',
    icon: Droplets,
    tone: 'purple',
  },
  {
    id: 'Covers & Pads',
    name: 'Zone D — Covers & Hardbound Pads',
    code: 'RACK-D04',
    capacity: 200,
    tempNote: 'Flat Horizontal Stacking',
    description: 'Acrylic album pads, leatherette covers, wooden & velvet presentation boxes.',
    icon: BookOpen,
    tone: 'emerald',
  },
];

export default function Warehouse({ items = [], setItems, openPage }) {
  const [selectedZone, setSelectedZone] = useState('All');
  const [notice, setNotice] = useState('');

  const cardStyle =
    'rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]';

  const notify = (msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };

  // Compute metrics for each studio storage zone
  const zoneStats = useMemo(() => {
    return STUDIO_ZONES.map((zone) => {
      const zoneItems = items.filter(
        (item) => (item.category || '').toLowerCase() === zone.id.toLowerCase()
      );
      const totalUnits = zoneItems.reduce((sum, i) => sum + Number(i.stock || 0), 0);
      const totalValue = zoneItems.reduce(
        (sum, i) => sum + Number(i.stock || 0) * Number(i.price || 0),
        0
      );
      const lowStockCount = zoneItems.filter((i) => i.stock <= i.minStock).length;
      const utilization = Math.min(100, Math.round((totalUnits / zone.capacity) * 100));

      return {
        ...zone,
        items: zoneItems,
        totalUnits,
        totalValue,
        lowStockCount,
        utilization,
      };
    });
  }, [items]);

  // Overall studio storage totals
  const totalCapacity = STUDIO_ZONES.reduce((sum, z) => sum + z.capacity, 0);
  const totalUnitsStored = items.reduce((sum, i) => sum + Number(i.stock || 0), 0);
  const totalWarehouseValue = items.reduce(
    (sum, i) => sum + Number(i.stock || 0) * Number(i.price || 0),
    0
  );
  const lowStockTotal = items.filter((i) => i.stock <= i.minStock).length;

  // Filtered items for the bottom rack table
  const displayedItems = useMemo(() => {
    if (selectedZone === 'All') return items;
    return items.filter(
      (item) => (item.category || '').toLowerCase() === selectedZone.toLowerCase()
    );
  }, [items, selectedZone]);

  // Quick +10 restock action directly from the Warehouse floor
  const handleQuickRestock = async (item, addQty = 10) => {
    if (!setItems) return;
    const updatedStock = Number(item.stock || 0) + addQty;

    setItems((current) =>
      current.map((i) => (i.id === item.id ? { ...i, stock: updatedStock } : i))
    );
    notify(`Restocked +${addQty} units of ${item.name} in ${item.category}.`);

    try {
      await fetch(`${API_BASE_URL}/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: updatedStock }),
      });
    } catch {
      // Offline state already updated above
    }
  };

  return (
    <div className="w-full space-y-6">
      {notice && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-6 py-4 text-sm font-medium text-indigo-700 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-between">
          <span>{notice}</span>
          <PackageCheck size={18} className="text-indigo-600" />
        </div>
      )}

      {/* ROW 1: Top Studio Storage Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Studio Storage Zones"
          value={STUDIO_ZONES.length}
          detail="Active raw material bays"
          icon={Building2}
          tone="indigo"
        />
        <MetricCard
          label="Total Units Stored"
          value={`${totalUnitsStored.toLocaleString()} / ${totalCapacity}`}
          detail={`${Math.min(100, Math.round((totalUnitsStored / totalCapacity) * 100))}% rack capacity used`}
          icon={Boxes}
          tone="blue"
        />
        <MetricCard
          label="Raw Material Value"
          value={`₹${totalWarehouseValue.toLocaleString()}`}
          detail="Current stock valuation"
          icon={Layers}
          tone="emerald"
        />
        <MetricCard
          label="Restock Alerts"
          value={lowStockTotal}
          detail={lowStockTotal === 0 ? 'All racks healthy' : 'Bays below minimum stock'}
          icon={AlertTriangle}
          tone={lowStockTotal === 0 ? 'emerald' : 'red'}
        />
      </div>

      {/* ROW 2: 4 Photo Book Studio Storage Zone Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {zoneStats.map((zone) => {
          const Icon = zone.icon;
          const isSelected = selectedZone === zone.id;

          return (
            <section
              key={zone.id}
              onClick={() => setSelectedZone(isSelected ? 'All' : zone.id)}
              className={`${cardStyle} cursor-pointer transition-all hover:border-indigo-200 ${
                isSelected ? 'ring-2 ring-indigo-600 border-indigo-600' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-50 pb-4">
                <div className="flex items-start gap-3.5">
                  <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 mt-0.5">
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{zone.name}</h3>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        {zone.code}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{zone.description}</p>
                  </div>
                </div>

                {zone.lowStockCount > 0 ? (
                  <span className="shrink-0 rounded-md bg-red-50 border border-red-100 px-2.5 py-1 text-xs font-semibold text-red-600 flex items-center gap-1">
                    <AlertTriangle size={13} /> {zone.lowStockCount} Low
                  </span>
                ) : (
                  <span className="shrink-0 rounded-md bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={13} /> Healthy
                  </span>
                )}
              </div>

              {/* Zone Stats Grid */}
              <div className="mt-4 grid grid-cols-3 gap-3 bg-[#f8f9fa] rounded-xl p-3.5 border border-gray-50 text-xs">
                <div>
                  <p className="text-gray-400 uppercase font-medium">SKUs Stored</p>
                  <p className="text-sm font-bold text-gray-900 mt-1">{zone.items.length} items</p>
                </div>
                <div>
                  <p className="text-gray-400 uppercase font-medium">Units on Rack</p>
                  <p className="text-sm font-bold text-gray-900 mt-1">
                    {zone.totalUnits} / {zone.capacity}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 uppercase font-medium">Zone Value</p>
                  <p className="text-sm font-bold text-indigo-600 mt-1">
                    ₹{zone.totalValue.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Utilization Bar & Storage Condition */}
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 font-medium">{zone.tempNote}</span>
                  <span className="font-semibold text-gray-700">{zone.utilization}% Full</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      zone.lowStockCount > 0 ? 'bg-amber-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${zone.utilization}%` }}
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* ROW 3: Rack Inventory Breakdown & Quick Restock Table */}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 p-6">
          <div>
            <h3 className="font-semibold text-gray-900">
              {selectedZone === 'All'
                ? 'All Studio Racks & Raw Materials'
                : `${selectedZone} — Rack Inventory`}
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              Click any zone card above to filter, or use Quick Restock (+10) when new material boxes arrive.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {selectedZone !== 'All' && (
              <button
                onClick={() => setSelectedZone('All')}
                className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Show All Zones
              </button>
            )}
            {openPage && (
              <button
                onClick={() => openPage('Inventory', 'Inventory')}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
              >
                Full Catalogue <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-white text-xs uppercase tracking-wider text-gray-500">
                <th className="p-4">Raw Material</th>
                <th className="p-4">SKU</th>
                <th className="p-4">Studio Zone</th>
                <th className="p-4 text-center">Current Stock</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Quick Floor Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-10 text-center text-gray-400">
                    No raw materials assigned to this zone yet.
                  </td>
                </tr>
              ) : (
                displayedItems.map((item) => {
                  const isLow = item.stock <= item.minStock;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/70">
                      <td className="p-4 font-medium text-gray-900">{item.name}</td>
                      <td className="p-4 text-gray-500">{item.sku}</td>
                      <td className="p-4 text-gray-500">{item.category}</td>
                      <td className="p-4 text-center font-semibold text-gray-900">
                        {item.stock} <span className="text-xs font-normal text-gray-400">(Min: {item.minStock})</span>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                            isLow ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                          }`}
                        >
                          {isLow ? 'Low Stock' : 'Optimal'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleQuickRestock(item, 10)}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                        >
                          <Plus size={13} /> Add 10 Units
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
    </div>
  );
}