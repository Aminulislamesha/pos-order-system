"use client";

import React, { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export default function LocationsTab() {
  const [locations, setLocations] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [newLocName, setNewLocName] = useState('');
  const [newLocNotes, setNewLocNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [printLoc, setPrintLoc] = useState<any>(null);

  // Quick Stock Add State
  const [quickAddLocationId, setQuickAddLocationId] = useState('');
  const [quickAddProductSearch, setQuickAddProductSearch] = useState('');
  const [quickAddProductId, setQuickAddProductId] = useState('');
  const [quickAddQty, setQuickAddQty] = useState('');

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const [locRes, prodRes] = await Promise.all([
        fetch('/api/inventory/locations'),
        fetch('/api/inventory/products')
      ]);
      const locData = await locRes.json();
      const prodData = await prodRes.json();
      
      if (locData.success) setLocations(locData.data);
      if (prodData.success) setProducts(prodData.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleCreateLocation = async () => {
    if (!newLocName) return;
    try {
      const res = await fetch('/api/inventory/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLocName, notes: newLocNotes })
      });
      const data = await res.json();
      if (data.success) {
        setNewLocName('');
        setNewLocNotes('');
        fetchLocations();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteLocation = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      const res = await fetch(`/api/inventory/locations?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchLocations();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete location.");
    }
  };

  const handlePrint = (loc: any) => {
    setPrintLoc(loc);
    setTimeout(() => {
      window.print();
      setPrintLoc(null);
    }, 100);
  };

  const handleQuickAddStock = async (locationId: string) => {
    if (!quickAddProductId || !quickAddQty) return alert("Select a product and enter a quantity.");
    try {
      const res = await fetch('/api/inventory/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: quickAddProductId,
          locationId,
          action: 'ADD',
          quantity: quickAddQty,
          reason: 'Quick add from Locations tab'
        })
      });
      const data = await res.json();
      if (data.success) {
        setQuickAddLocationId('');
        setQuickAddProductId('');
        setQuickAddQty('');
        setQuickAddProductSearch('');
        alert("Stock added successfully!");
        fetchLocations();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div>Loading locations...</div>;

  // Smart Product Search
  const filteredProducts = products.filter(p => {
    if (!quickAddProductSearch.trim()) return true;
    const terms = quickAddProductSearch.toLowerCase().split(/\s+/);
    const searchable = `${p.name} ${p.aliases.map((a:any) => a.name).join(' ')}`.toLowerCase();
    return terms.every(term => searchable.includes(term));
  });

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 print:hidden">
      {/* Create Location */}
      <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg h-fit">
        <h2 className="text-xl font-bold mb-4">Add New Location</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-bold mb-1">Location Name</label>
          <input 
            type="text" 
            placeholder="E.g., Warehouse A" 
            className="w-full border p-2 rounded text-gray-900 bg-white placeholder-gray-400"
            value={newLocName}
            onChange={e => setNewLocName(e.target.value)}
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-bold mb-1">Notes (Optional)</label>
          <textarea 
            placeholder="Additional details..." 
            className="w-full border p-2 rounded text-gray-900 bg-white placeholder-gray-400"
            value={newLocNotes}
            onChange={e => setNewLocNotes(e.target.value)}
          />
        </div>

        <button 
          onClick={handleCreateLocation} 
          className="w-full bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700"
        >
          Create Location
        </button>
      </div>

      {/* List Locations */}
      <div className="md:col-span-2">
        <h2 className="text-xl font-bold mb-4">Existing Locations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {locations.map(loc => {
            const totalQty = loc.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
            return (
              <div key={loc.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">{loc.uid}</span>
                    <h3 className="font-bold text-lg text-gray-800 mt-2">{loc.name}</h3>
                    {loc.notes && <p className="text-sm text-gray-500 mt-1">{loc.notes}</p>}
                  </div>
                  <div className="p-1 bg-white border border-gray-200 rounded">
                    <QRCodeCanvas value={`${window.location.origin}/locations/${loc.uid}`} size={64} />
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-end">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Items Stored Here</p>
                    <p className="text-2xl font-black text-blue-600 mt-1">
                      {totalQty} <span className="text-sm text-gray-400 font-normal">units</span>
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setQuickAddLocationId(quickAddLocationId === loc.id ? '' : loc.id);
                      setQuickAddProductSearch('');
                      setQuickAddProductId('');
                      setQuickAddQty('');
                    }} 
                    className="text-xs bg-green-100 text-green-700 font-bold px-2 py-1 rounded hover:bg-green-200"
                  >
                    + Add Stock
                  </button>
                </div>

                {quickAddLocationId === loc.id && (
                  <div className="mt-3 p-3 bg-white rounded border border-green-200 shadow-sm flex flex-col gap-2">
                    <p className="text-xs font-bold text-green-800">Add Stock to {loc.name}</p>
                    <input 
                      type="text" 
                      placeholder="Search Product..." 
                      className="border p-1.5 text-sm rounded w-full text-gray-900 bg-gray-50"
                      value={quickAddProductSearch}
                      onChange={e => {
                        setQuickAddProductSearch(e.target.value);
                        const newFiltered = products.filter(p => {
                          const terms = e.target.value.toLowerCase().split(/\s+/);
                          const searchable = `${p.name} ${p.aliases.map((a:any) => a.name).join(' ')}`.toLowerCase();
                          return terms.every(t => searchable.includes(t));
                        });
                        if (newFiltered.length === 1) {
                          setQuickAddProductId(newFiltered[0].id);
                        } else if (newFiltered.length === 0 || !newFiltered.find(p => p.id === quickAddProductId)) {
                          setQuickAddProductId('');
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <select 
                        className="border p-1.5 text-sm rounded flex-1 text-gray-900 bg-white"
                        value={quickAddProductId}
                        onChange={e => setQuickAddProductId(e.target.value)}
                      >
                        <option value="">-- Choose Product --</option>
                        {filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Qty" 
                        className="border p-1.5 text-sm rounded w-20 text-gray-900"
                        value={quickAddQty}
                        onChange={e => setQuickAddQty(e.target.value)}
                      />
                      <button 
                        onClick={() => handleQuickAddStock(loc.id)} 
                        className="bg-green-600 text-white px-3 py-1.5 rounded font-bold hover:bg-green-700 text-sm"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4 flex justify-between gap-2">
                  <button 
                    onClick={() => handlePrint(loc)}
                    className="flex-1 bg-gray-800 text-white text-sm font-bold py-1.5 rounded hover:bg-gray-900"
                  >
                    🖨️ Print Label
                  </button>
                  <button 
                    onClick={() => handleDeleteLocation(loc.id, loc.name)}
                    className="bg-red-100 text-red-600 px-3 text-sm font-bold rounded hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {locations.length === 0 && <p className="text-gray-500 italic col-span-2">No locations defined yet.</p>}
        </div>
      </div>
      </div>

      {/* Hidden Print Container for 58mm Thermal Printer (Max width ~58mm) */}
      {printLoc && (
        <div className="hidden print:flex absolute top-0 left-0 w-full h-full bg-white text-black flex-col items-center p-2 text-center" style={{ width: '58mm' }}>
          <h2 className="text-lg font-bold leading-none mb-1">{printLoc.name}</h2>
          <p className="text-xs font-bold mb-2">{printLoc.uid}</p>
          <QRCodeCanvas value={`${window.location.origin}/locations/${printLoc.uid}`} size={120} />
          <p className="text-[10px] mt-2 italic break-words w-full">Scan to view inventory</p>
        </div>
      )}
    </div>
  );
}
