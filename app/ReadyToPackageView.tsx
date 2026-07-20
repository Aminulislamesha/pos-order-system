"use client";

import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

// Format short date helper for receipt
const formatShortDate = (dateStr: string) => {
  if (!dateStr || String(dateStr).trim() === "") return "";
  
  // Handle Google Sheets serial dates (e.g. "46210.764548611")
  const asNumber = Number(dateStr);
  if (!isNaN(asNumber) && asNumber > 40000) {
     // Excel epoch is Dec 30, 1899 (adjusted for 1900 leap year bug)
     const date = new Date(Math.round((asNumber - 25569) * 86400 * 1000));
     return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  const cleanStr = String(dateStr).replace(/at\s+/i, '');
  const parsed = new Date(cleanStr);
  if (isNaN(parsed.getTime())) return String(dateStr);
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

// Format long date helper for table
const formatGoogleDate = (dateStr: string) => {
  if (!dateStr || String(dateStr).trim() === "") return "";
  const numericSerial = Number(dateStr);
  if (isNaN(numericSerial)) {
    const parsed = new Date(String(dateStr).replace(/at\s+/i, ''));
    if (!isNaN(parsed.getTime())) return parsed.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    return String(dateStr);
  }
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const convertedDate = new Date(excelEpoch.getTime() + numericSerial * 86400000);
  return convertedDate.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

const cleanPhoneNumber = (phone: string) => {
  const p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('880')) return '+' + p;
  if (p.startsWith('01')) return '+88' + p;
  return p;
};

const extractProducts = (cells: any[]) => {
  const products = [];
  for (let i = 11; i < cells.length; i += 2) {
    const productName = cells[i]?.value;
    const productQty = cells[i + 1]?.value;
    if (productName && String(productName).trim() !== "" && productName !== "NaN") {
      products.push({ name: String(productName), qty: productQty ? String(productQty) : "1" });
    }
  }
  return products;
};

export default function ReadyToPackageView({ onBack }: { onBack: () => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [excludedOrderIds, setExcludedOrderIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Dynamic Filters
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);
  
  // Deduct Modal
  const [showModal, setShowModal] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]); // To track available stock
  const [deductPreview, setDeductPreview] = useState<any[]>([]); // Flattened items for deduction
  const [processing, setProcessing] = useState(false);
  const [printMode, setPrintMode] = useState<'pos' | 'picklist' | null>(null);

  useEffect(() => {
    fetchData();
  }, [excludedOrderIds, selectedTags, selectedDates]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (excludedOrderIds.length > 0) params.append('exclude', excludedOrderIds.join(','));
      if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));
      if (selectedDates.length > 0) params.append('dates', selectedDates.join(','));
      
      const [ordRes, locRes, prodRes] = await Promise.all([
        fetch(`/api/inventory/ready-to-package?${params.toString()}`),
        fetch('/api/inventory/locations'),
        fetch('/api/inventory/products')
      ]);
      const ordData = await ordRes.json();
      const locData = await locRes.json();
      const prodData = await prodRes.json();
      
      if (ordData.success) {
        setOrders(ordData.data);
        if (ordData.availableTags) setAvailableTags(ordData.availableTags);
        if (ordData.availableDates) setAvailableDates(ordData.availableDates);
      }
      if (locData.success) setLocations(locData.data);
      if (prodData.success) setProducts(prodData.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedOrders(orders.map(o => o.orderId));
    else setSelectedOrders([]);
    setLastSelectedIndex(null);
  };

  const handleSelect = (e: any, index: number, id: string, isFulfillable: boolean) => {
    if (!isFulfillable) return;
    
    const isShiftPressed = e.shiftKey || (e.nativeEvent && e.nativeEvent.shiftKey);
    
    if (isShiftPressed && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      
      const idsToAdd: string[] = [];
      for (let i = start; i <= end; i++) {
        const order = orders[i];
        if (order && order.isFulfillable && !order.isHidden) {
          idsToAdd.push(order.orderId);
        }
      }
      
      setSelectedOrders(prev => {
        const newSet = new Set(prev);
        idsToAdd.forEach(x => newSet.add(x));
        return Array.from(newSet);
      });
    } else {
      setSelectedOrders(prev => {
        if (prev.includes(id)) {
          return prev.filter(x => x !== id);
        } else {
          return [...prev, id];
        }
      });
    }
    setLastSelectedIndex(index);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      if (lastSelectedIndex === null) return;
      
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); // prevent page scrolling
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = lastSelectedIndex + direction;
        
        if (nextIndex >= 0 && nextIndex < orders.length) {
          const nextOrder = orders[nextIndex];
          if (nextOrder.isFulfillable && !nextOrder.isHidden) {
            setSelectedOrders(prev => {
              if (!prev.includes(nextOrder.orderId)) {
                return [...prev, nextOrder.orderId];
              }
              return prev;
            });
            setLastSelectedIndex(nextIndex);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lastSelectedIndex, orders]);

  const handleExclude = (id: string) => {
    setExcludedOrderIds(prev => [...prev, id]);
    // Removes from selected if it was selected
    setSelectedOrders(prev => prev.filter(x => x !== id));
  };

  const handleUnhide = (id: string) => {
    setExcludedOrderIds(prev => prev.filter(x => x !== id));
  };

  const handleOpenDeductModal = () => {
    if (selectedOrders.length === 0) return alert("Select at least one order.");
    
    const previewMap = new Map();
    for (const id of selectedOrders) {
      const order = orders.find(o => o.orderId === id);
      if (!order) continue;

      for (const item of order.items) {
        const key = item.canonicalProduct.id;
        if (!previewMap.has(key)) {
          previewMap.set(key, {
            rawName: item.canonicalProduct.name,
            productId: item.canonicalProduct.id,
            totalQty: 0,
            orders: [],
            allocations: []
          });
        }
        const group = previewMap.get(key);
        group.totalQty += item.requestedQty;
        group.orders.push({ orderId: order.orderId, qty: item.requestedQty });
        
        for (const alloc of item.allocations) {
          const existing = group.allocations.find((a: any) => a.locationId === alloc.locationId);
          if (existing) {
            existing.qty += alloc.qty;
          } else {
            group.allocations.push({ locationId: alloc.locationId, qty: alloc.qty });
          }
        }
      }
    }
    setDeductPreview(Array.from(previewMap.values()));
    setShowModal(true);
  };

  const handleAllocChange = (idx: number, allocIdx: number, field: string, value: any) => {
    const updated = [...deductPreview];
    
    if (field === 'qty') {
      const productId = updated[idx].productId;
      const locationId = updated[idx].allocations[allocIdx].locationId;
      const prod = products.find(p => p.id === productId);
      const inv = prod?.inventory?.find((i: any) => i.locationId === locationId);
      const available = inv ? inv.quantity : 0;
      
      if (value > available) {
        alert(`Cannot allocate ${value}. Only ${available} available in this location.`);
        value = available;
      }
    }
    
    updated[idx].allocations[allocIdx][field] = value;

    if (field === 'locationId') {
      const productId = updated[idx].productId;
      const prod = products.find(p => p.id === productId);
      const inv = prod?.inventory?.find((i: any) => i.locationId === value);
      const available = inv ? inv.quantity : 0;
      
      if (updated[idx].allocations[allocIdx].qty > available) {
        updated[idx].allocations[allocIdx].qty = available; // cap it
      }
    }

    setDeductPreview(updated);
  };

  const addAlloc = (idx: number) => {
    const updated = [...deductPreview];
    updated[idx].allocations.push({ locationId: locations[0]?.id || '', qty: 0 });
    setDeductPreview(updated);
  };

  const removeAlloc = (idx: number, allocIdx: number) => {
    const updated = [...deductPreview];
    updated[idx].allocations.splice(allocIdx, 1);
    setDeductPreview(updated);
  };

  const handleFinalizeDeductions = async () => {
    if (!confirm("Are you sure you want to deduct these items from inventory?")) return;
    
    setProcessing(true);
    try {
      for (const p of deductPreview) {
        const sum = p.allocations.reduce((s: number, a: any) => s + a.qty, 0);
        if (sum !== p.totalQty) {
          setProcessing(false);
          return alert(`Allocation mismatch for ${p.rawName}. Required: ${p.totalQty}, Allocated: ${sum}`);
        }
      }

      // Group by orderId based on the pool of allocations
      const byOrder = new Map<string, any[]>();
      
      for (const p of deductPreview) {
        const pool = p.allocations.map((a: any) => ({ ...a }));
        let poolIdx = 0;

        for (const orderEntry of p.orders) {
          let qtyToFulfill = orderEntry.qty;
          if (!byOrder.has(orderEntry.orderId)) byOrder.set(orderEntry.orderId, []);
          
          while (qtyToFulfill > 0 && poolIdx < pool.length) {
             const currentPool = pool[poolIdx];
             if (currentPool.qty === 0) {
                poolIdx++;
                continue;
             }
             const take = Math.min(qtyToFulfill, currentPool.qty);
             currentPool.qty -= take;
             qtyToFulfill -= take;
             
             byOrder.get(orderEntry.orderId)!.push({
                productId: p.productId,
                locationId: currentPool.locationId,
                qty: take
             });
          }
        }
      }

      const rowIndicesToStrikethrough: number[] = [];

      for (const [orderId, allocations] of byOrder.entries()) {
        const res = await fetch('/api/inventory/deduct-smart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, allocations })
        });
        const data = await res.json();
        if (!data.success) {
          alert(`Failed to deduct Order ${orderId}: ${data.error}`);
          // Stop processing further if one fails to prevent partial messes
          break;
        }

        const order = orders.find(o => o.orderId === orderId);
        if (order && typeof order.originalRowIndex === 'number') {
           rowIndicesToStrikethrough.push(order.originalRowIndex);
        }
      }

      // Batch strikethrough all successfully deducted orders
      if (rowIndicesToStrikethrough.length > 0) {
        await fetch('/api/scanner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: "strikethrough",
            rowIndices: rowIndicesToStrikethrough
          })
        });
      }

      alert("Deductions successful! Orders marked as packed.");
      setShowModal(false);
      setSelectedOrders([]);
      fetchData(); // Refresh list

    } catch (e) {
      console.error(e);
      alert("An error occurred");
    }
    setProcessing(false);
  };

  return (
    <>
      <div className={`fixed inset-0 bg-gray-100 z-50 flex flex-col p-4 md:p-8 ${printMode ? 'print:hidden' : ''}`}>
        <div className="bg-white flex-1 rounded-xl shadow-lg flex flex-col overflow-hidden max-w-7xl mx-auto w-full">
        
        {/* Header */}
        <div className="bg-blue-600 p-4 md:p-6 flex flex-col md:flex-row justify-between items-center text-white shrink-0 print:hidden">
          <div>
            <h2 className="text-2xl font-bold mb-1">📦 Ready to Package (Smart View)</h2>
            <p className="text-blue-200 text-sm">Showing 100% fulfillable orders, sorted by priority and stock. {selectedOrders.length} of {orders.length} orders selected.</p>
          </div>
          <div className="flex gap-2 mt-4 md:mt-0 flex-wrap justify-end items-center">
            <button 
              onClick={fetchData} 
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded shadow flex items-center gap-2 disabled:opacity-50"
              title="Refresh stock and orders without losing selections"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {loading ? 'Syncing...' : 'Sync Stock'}
            </button>
            <div className="w-px h-6 bg-blue-400 mx-1"></div>
            <button 
              onClick={() => {
                setPrintMode('pos');
                setTimeout(() => { window.print(); setPrintMode(null); }, 100);
              }} 
              disabled={selectedOrders.length === 0} 
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded shadow disabled:bg-gray-500"
            >
              🖨️ Print Selected POS
            </button>
            <button onClick={handleOpenDeductModal} disabled={selectedOrders.length === 0} className="bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 rounded shadow disabled:bg-gray-500">
              Deduct Selected
            </button>
            <button onClick={onBack} className="bg-blue-800 hover:bg-blue-900 text-white font-bold py-2 px-4 rounded shadow">
              Back to Main
            </button>
            {excludedOrderIds.length > 0 && (
              <button 
                onClick={() => setExcludedOrderIds([])}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded shadow text-xs ml-2"
              >
                🔄 Reset {excludedOrderIds.length} Hidden
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Filters */}
        <div className="bg-gray-100 p-4 border-b flex flex-col md:flex-row gap-8 print:hidden shrink-0 overflow-visible relative">
          
          {/* Tags Dropdown */}
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-gray-700">Priority 1: Tags (Column C)</h3>
              {selectedTags.length > 0 && <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{selectedTags.length} Selected</span>}
            </div>
            
            <button 
              onClick={() => { setShowTagMenu(!showTagMenu); setShowDateMenu(false); }}
              className="flex items-center justify-between min-w-[160px] gap-2 bg-white border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-50 shadow-sm font-medium"
            >
              <span>🏷️ + Add Filter</span>
              <svg className={`w-4 h-4 transition-transform text-gray-400 ${showTagMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {showTagMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTagMenu(false)}></div>
                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-xl z-50 max-h-64 overflow-y-auto">
                  {availableTags.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 italic">No tags found</div>
                  ) : (
                    <div className="flex flex-col py-1">
                      {availableTags.map(tag => (
                        <label key={tag} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 cursor-pointer">
                          <input type="checkbox" className="accent-blue-600 w-4 h-4" 
                            checked={selectedTags.includes(tag.toLowerCase())}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedTags(prev => [...prev, tag.toLowerCase()]);
                              else setSelectedTags(prev => prev.filter(t => t !== tag.toLowerCase()));
                            }}
                          />
                          <span className="text-sm text-gray-800">{tag}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          
          {/* Dates Dropdown */}
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-gray-700">Priority 2: Dates (Column A)</h3>
              {selectedDates.length > 0 && <span className="bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{selectedDates.length} Selected</span>}
            </div>

            <button 
              onClick={() => { setShowDateMenu(!showDateMenu); setShowTagMenu(false); }}
              className="flex items-center justify-between min-w-[160px] gap-2 bg-white border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-50 shadow-sm font-medium"
            >
              <span>📅 mm/dd/yyyy</span>
              <svg className={`w-4 h-4 transition-transform text-gray-400 ${showDateMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {showDateMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDateMenu(false)}></div>
                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-xl z-50 max-h-64 overflow-y-auto">
                  {availableDates.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 italic">No dates found</div>
                  ) : (
                    <div className="flex flex-col py-1">
                      {availableDates.map(date => (
                        <label key={date} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 cursor-pointer">
                          <input type="checkbox" className="accent-green-600 w-4 h-4"
                            checked={selectedDates.includes(date.toLowerCase())}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedDates(prev => [...prev, date.toLowerCase()]);
                              else setSelectedDates(prev => prev.filter(d => d !== date.toLowerCase()));
                            }}
                          />
                          <span className="text-sm text-gray-800">{date}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50 relative print:hidden">
          {loading ? (
            <div className="flex justify-center items-center h-64 text-gray-500 font-bold text-xl">
              Crunching inventory math...
            </div>
          ) : (
            <div className="bg-white overflow-x-auto">
              <table className="w-full min-w-max text-left border-collapse">
                <thead className="bg-gray-200 text-gray-700 sticky top-0 shadow-sm">
                  <tr>
                    <th className="p-4 border-b border-r bg-gray-300 text-center select-none w-10">
                      <input type="checkbox" className="w-5 h-5 cursor-pointer accent-blue-600" onChange={handleSelectAll} checked={orders.length > 0 && selectedOrders.length === orders.length} />
                    </th>
                    <th className="p-4 border-b border-r bg-gray-300 text-center text-sm w-20">Actions</th>
                    <th className="p-4 border-b border-r bg-gray-300 text-center text-sm w-48">Status / Shortages</th>
                    {orders.length > 0 && orders[0].cells?.map((_: any, i: number) => (
                      <th key={i} className="p-4 border-b border-r last:border-r-0 whitespace-nowrap bg-gray-200">Col {String.fromCharCode(65 + i)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={30} className="p-10 text-center text-xl text-gray-500">No fully fulfillable orders right now.</td></tr>
                  ) : (
                    orders.map((o, index) => {
                      const isSelected = selectedOrders.includes(o.orderId);
                      
                      let rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                      if (o.isHidden) rowClass = 'bg-gray-100 opacity-60 grayscale';
                      else if (isSelected) rowClass = 'bg-blue-100 border-blue-200';
                      else if (o.isFulfillable === false) rowClass = 'bg-red-50 hover:bg-red-100 border-red-200';
                      else rowClass += ' hover:bg-blue-50';
                          
                      return (
                        <tr key={o.orderId} className={`border-b transition ${rowClass}`}>
                          <td className="p-2 border-r text-center align-middle">
                            <input 
                              type="checkbox" 
                              className={`w-5 h-5 ${o.isFulfillable && !o.isHidden ? 'cursor-pointer accent-blue-600' : 'cursor-not-allowed opacity-50'}`}
                              checked={isSelected} 
                              onChange={(e) => handleSelect(e, index, o.orderId, o.isFulfillable)} 
                              disabled={!o.isFulfillable || o.isHidden}
                            />
                          </td>
                          <td className="p-2 border-r text-center align-middle">
                            {o.isHidden ? (
                              <button 
                                onClick={() => handleUnhide(o.orderId)}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded border border-blue-800 shadow-sm whitespace-nowrap"
                                title="Bring back this order into the allocation queue"
                              >
                                🔄 Unhide
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleExclude(o.orderId)}
                                className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs px-2 py-1 rounded border border-gray-400 shadow-sm whitespace-nowrap"
                                title="Hide this order and free up its stock"
                              >
                                👁️ Hide
                              </button>
                            )}
                          </td>
                          <td className="p-2 border-r align-middle">
                            {o.isHidden ? (
                              <span className="bg-gray-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full inline-block w-fit">
                                HIDDEN (STOCK FREED)
                              </span>
                            ) : !o.isFulfillable && o.isPriority ? (
                              <div className="flex flex-col gap-1">
                                <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full inline-block w-fit">
                                  {o.status ? `${o.status.toUpperCase()} SHORTAGE` : 'SHORTAGE'}
                                </span>
                                {o.items.filter((i: any) => i.shortage > 0).map((item: any, idx: number) => (
                                  <div key={idx} className="text-[10px] text-red-700 font-bold leading-tight bg-red-100 p-1 rounded">
                                    ⚠️ Missing {item.shortage}x <br/> {item.rawName}
                                  </div>
                                ))}
                              </div>
                            ) : o.isFulfillable ? (
                              <span className="text-green-600 text-xs font-bold flex items-center gap-1">
                                ✅ Fulfillable
                              </span>
                            ) : null}
                          </td>
                          {o.cells?.map((cell: any, cellIndex: number) => (
                            <td 
                              key={cellIndex} 
                              className="p-2 border-r max-w-[300px] truncate text-gray-900"
                              title={cell.note || cell.value}
                              style={{ 
                                backgroundColor: cell.backgroundColor || 'transparent',
                                textDecoration: cell.strikethrough ? 'line-through' : 'none'
                              }}
                            >
                              {cellIndex === 0 ? formatGoogleDate(o.date) : cell.value}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Deduct Preview Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-2xl font-bold text-gray-800">Deduction Preview</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-black font-bold text-xl">&times;</button>
              </div>
              
              <div className="p-6 overflow-auto flex-1 bg-gray-50">
                <p className="mb-4 text-gray-600">Review the auto-selected locations below. You can manually change where stock is pulled from before confirming.</p>
                <div className="bg-white border rounded shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="p-3 text-sm">Product Name</th>
                        <th className="p-3 text-sm">Total Qty (Needed)</th>
                        <th className="p-3 text-sm">Deduct From Location(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductPreview.map((item, idx) => {
                        const allocatedSum = item.allocations.reduce((sum: number, a: any) => sum + a.qty, 0);
                        const isMatched = allocatedSum === item.totalQty;
                        return (
                          <tr key={idx} className="border-b">
                            <td className="p-3 text-sm font-bold text-gray-800 align-top">{item.rawName}</td>
                            <td className="p-3 text-sm font-bold text-blue-600 align-top">
                              {item.totalQty} pcs
                              {!isMatched && <div className="text-xs text-red-500 mt-1 font-bold">Allocated: {allocatedSum} pcs</div>}
                            </td>
                            <td className="p-3 space-y-2">
                              {item.allocations.map((alloc: any, allocIdx: number) => (
                                <div key={allocIdx} className="flex items-center gap-2">
                                  <select 
                                    className="border p-1 text-sm rounded w-40 bg-white border-gray-300 text-gray-900"
                                    value={alloc.locationId}
                                    onChange={(e) => handleAllocChange(idx, allocIdx, 'locationId', e.target.value)}
                                  >
                                    {locations.map(loc => {
                                      const prod = products.find(p => p.id === item.productId);
                                      const inv = prod?.inventory?.find((i: any) => i.locationId === loc.id);
                                      const qty = inv ? inv.quantity : 0;
                                      return (
                                        <option key={loc.id} value={loc.id}>{loc.name} ({qty} available)</option>
                                      );
                                    })}
                                  </select>
                                  <input 
                                    type="number" 
                                    min="1"
                                    className="border p-1 text-sm rounded w-20 text-gray-900"
                                    value={alloc.qty}
                                    onChange={(e) => handleAllocChange(idx, allocIdx, 'qty', parseInt(e.target.value) || 0)}
                                  />
                                  <span className="text-gray-500 text-sm">pcs</span>
                                  <button onClick={() => removeAlloc(idx, allocIdx)} className="text-red-500 hover:text-red-700 font-bold ml-2">✕</button>
                                </div>
                              ))}
                              <button onClick={() => addAlloc(idx)} className="text-xs text-blue-600 font-bold hover:underline mt-1">+ Add Source Location</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 bg-gray-100 flex justify-between items-center">
                <button 
                  onClick={() => {
                    setPrintMode('picklist');
                    setTimeout(() => { window.print(); setPrintMode(null); }, 100);
                  }} 
                  className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded font-bold"
                >
                  🖨️ Print Pick List
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">Cancel</button>
                  <button onClick={handleFinalizeDeductions} disabled={processing} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold shadow">
                    {processing ? "Processing..." : "Deduction and Strikethrough"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
      </div>

      {/* EXCLUSIVE POS PRINTER UI (80mm Receipt layout) FOR READY TO PACKAGE */}
      {printMode === 'pos' && (
        <div className="hidden print:block bg-white text-black font-mono text-[10px] leading-none max-w-[80mm] break-words mx-auto pb-4">
          {orders.filter(order => selectedOrders.includes(order.orderId)).map((order, index) => {
            if (!order.cells) return null;
          const rawName = String(order.cells[3]?.value || "No Name Provided").trim();
          const customerName = rawName.split(/\s+/).slice(0, 2).join(" ");
          const rawPhone = order.cells[4]?.value || "";
          const phone = cleanPhoneNumber(rawPhone);
          const address = order.cells[5]?.value || "";
          const totalAmount = order.cells[10]?.value || "0";
          const products = extractProducts(order.cells);

          return (
            <div key={index} className="flex flex-col py-0.5 border-b-2 border-dashed border-black mb-0.5 pb-0.5" style={{ pageBreakInside: 'avoid' }}>
              <div className="flex items-center justify-center gap-2 mb-0.5 pb-0.5 border-b-2 border-black">
                <img src="/logo2.png" alt="Nitto Notun" className="h-6 w-auto object-contain brightness-0" />
                <h3 className="text-sm font-bold uppercase tracking-widest leading-none">Nitto Notun</h3>
              </div>
              <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col w-2/3 pr-0">
                  <p className="text-[13px] font-bold leading-none float-left">ID: {order.orderId}</p>
                  <p className="text-[11px] font-bold leading-none float-left">{customerName}</p>
                  <p className="text-[10px] mb-1.5 mt-0.5">Date: {formatShortDate(order.date)}</p>
                  <p className="font-bold leading-tight">{phone}</p>
                  <p className="text-[8px] whitespace-pre-wrap mt-0.5 leading-tight">{address}</p>
                </div>
                <div className="w-1/3 flex justify-end pr-2">
                  <QRCodeCanvas value={order.orderId} size={64} />
                </div>
              </div>
              <div className="mb-0 border-t border-dashed border-black pt-1">
                {products.length === 0 ? (
                   <p className="text-[8px] italic">No items found</p>
                ) : (
                  products.map((item, i) => (
                    <div key={i} className="flex justify-between text-[10px] mb-0">
                      <span className="w-9/10 break-words leading-3">{item.name}</span>
                      <span className="w-1/10 text-center font-bold">x{item.qty}</span>
                    </div>
                  ))
                )}
              </div>
              {order.status && (
                <p className="text-[9px] font-bold mb-0 pb-0 pt-0.5 break-words whitespace-pre-wrap">Note: {order.status}</p>
              )}
              <div className="flex justify-between font-bold text-sm border-t border-black pr-3">
                <span>Total:</span>
                <span>৳{totalAmount}</span>
              </div>
              <div className="flex flex-col items-center justify-center mt-0 mb-1 pt-0 pb-1 border-t border-dashed border-gray-400">
                <p className="text-[8px] font-bold mt-1 text-center italic">Thanks for ordering at Nitto Notun.</p>
                <p className="text-[7px] text-center mt-0.5">nittonotun.shop | +880 13062 86385</p>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {/* PICK LIST POS PRINTER UI */}
      {printMode === 'picklist' && (
        <div className="hidden print:block bg-white text-black font-mono text-[10px] leading-tight max-w-[80mm] mx-auto absolute top-0 left-0 p-2">
          <h2 className="text-center font-bold text-lg border-b border-black pb-2 mb-2">PICK LIST</h2>
          {(() => {
            const locMap = new Map<string, { rawName: string, qty: number }[]>();
            deductPreview.forEach(item => {
              item.allocations.forEach((alloc: any) => {
                if (alloc.qty > 0) {
                  if (!locMap.has(alloc.locationId)) locMap.set(alloc.locationId, []);
                  locMap.get(alloc.locationId)!.push({ rawName: item.rawName, qty: alloc.qty });
                }
              });
            });

            return Array.from(locMap.entries()).map(([locId, items], idx) => {
              const locName = locations.find(l => l.id === locId)?.name || 'Unknown Location';
              return (
                <div key={idx} className="mb-4 border-b border-gray-400 pb-2 border-dashed">
                  <div className="font-bold text-[16px] leading-tight mb-2 underline">{locName}</div>
                  {items.map((item, itemIdx) => (
                    <div key={itemIdx} className="flex justify-between items-center py-0.5">
                      <span className="font-bold pr-2">{item.rawName}</span>
                      <span className="font-bold whitespace-nowrap">{item.qty} pcs</span>
                    </div>
                  ))}
                </div>
              );
            });
          })()}
          <div className="text-center mt-4">--- END OF PICK LIST ---</div>
        </div>
      )}
    </>
  );
}
