"use client";

import React, { useState, useEffect } from 'react';

export default function ProductsTab() {
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductType, setNewProductType] = useState('PRODUCT');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [unmappedLoading, setUnmappedLoading] = useState(false);

  // Quick Stock Add State
  const [quickAddProductId, setQuickAddProductId] = useState('');
  const [quickAddLocationSearch, setQuickAddLocationSearch] = useState('');
  const [quickAddLocationId, setQuickAddLocationId] = useState('');
  const [quickAddQty, setQuickAddQty] = useState('');
  
  // Viewing Locations State
  const [viewingLocationsProductId, setViewingLocationsProductId] = useState('');

  // For Aliases
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [newAlias, setNewAlias] = useState('');

  useEffect(() => {
    fetchLocalData();
    fetchUnmapped();
  }, []);

  const fetchLocalData = async () => {
    try {
      const [prodRes, locRes] = await Promise.all([
        fetch('/api/inventory/products'),
        fetch('/api/inventory/locations')
      ]);
      const prodData = await prodRes.json();
      const locData = await locRes.json();
      
      if (prodData.success) setProducts(prodData.data);
      if (locData.success) setLocations(locData.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchUnmapped = async () => {
    setUnmappedLoading(true);
    try {
      const unmappedRes = await fetch('/api/inventory/unmapped');
      const unmappedData = await unmappedRes.json();
      if (unmappedData.success) {
        setUnmapped(unmappedData.data);
        // Also refresh local data because unmapped route might have auto-created new products!
        fetchLocalData(); 
      }
    } catch (e) {
      console.error(e);
    }
    setUnmappedLoading(false);
  };

  const handleCreateProduct = async () => {
    if (!newProductName) return;
    try {
      const res = await fetch('/api/inventory/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProductName, type: newProductType })
      });
      const data = await res.json();
      if (data.success) {
        setNewProductName('');
        fetchLocalData();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddAlias = async (aliasText: string) => {
    if (!selectedProductId || !aliasText) return alert("Select a product first.");
    try {
      const res = await fetch('/api/inventory/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: aliasText, productId: selectedProductId })
      });
      const data = await res.json();
      if (data.success) {
        setNewAlias('');
        fetchLocalData();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAlias = async (aliasId: string) => {
    if (!confirm("Are you sure you want to delete this alias?")) return;
    try {
      const res = await fetch(`/api/inventory/aliases?id=${aliasId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchLocalData();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product? All its aliases and stock counts will also be deleted.")) return;
    try {
      const res = await fetch(`/api/inventory/products?id=${productId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchLocalData();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuickAddStock = async (productId: string) => {
    if (!quickAddLocationId || !quickAddQty) return alert("Select a location and enter a quantity.");
    try {
      const res = await fetch('/api/inventory/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          locationId: quickAddLocationId,
          action: 'ADD',
          quantity: quickAddQty,
          reason: 'Quick add from Products tab'
        })
      });
      const data = await res.json();
      if (data.success) {
        setQuickAddProductId('');
        setQuickAddLocationId('');
        setQuickAddQty('');
        setQuickAddLocationSearch('');
        alert("Stock added successfully!");
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div>Loading products...</div>;

  // Smart Location Search
  const filteredLocations = locations.filter(l => {
    if (!quickAddLocationSearch.trim()) return true;
    const terms = quickAddLocationSearch.toLowerCase().split(/\s+/);
    const searchable = `${l.name} ${l.uid}`.toLowerCase();
    return terms.every(term => searchable.includes(term));
  });

  // Fast Search Engine implementation
  const filteredProducts = products.filter(p => {
    // Filter by selected type (Product or Supply)
    if (p.type !== newProductType) return false;

    if (!searchQuery.trim()) return true;
    const terms = searchQuery.toLowerCase().split(/\s+/);
    const searchableString = `${p.name} ${p.type} ${p.aliases.map((a:any) => a.alias).join(' ')}`.toLowerCase();
    return terms.every(term => searchableString.includes(term));
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Left Column: Products */}
      <div>
        <h2 className="text-xl font-bold mb-4">Canonical Products</h2>
        
        <div className="flex gap-2 mb-6">
          <select 
            className="border p-2 rounded text-gray-900 bg-white border-gray-300"
            value={newProductType}
            onChange={e => setNewProductType(e.target.value)}
          >
            <option value="PRODUCT">📦 Product</option>
            <option value="SUPPLY">✂️ Supply</option>
          </select>
          <input 
            type="text" 
            placeholder="E.g., Solid Color Formal Pants - Beige / XL" 
            className="border p-2 flex-1 rounded text-gray-900 bg-white placeholder-gray-400"
            value={newProductName}
            onChange={e => setNewProductName(e.target.value)}
          />
          <button onClick={handleCreateProduct} className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 whitespace-nowrap">Add Item</button>
        </div>

        <div className="mb-4">
          <input 
            type="text" 
            placeholder="🔍 Fast Search (e.g., formal black XL)..." 
            className="w-full border p-2 rounded text-gray-900 bg-gray-50 placeholder-gray-500 border-gray-300 font-bold"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {filteredProducts.map(p => {
            const totalStock = p.inventory?.reduce((sum: number, inv: any) => sum + inv.quantity, 0) || 0;
            return (
            <div key={p.id} className="border border-gray-200 p-4 rounded-lg bg-gray-50 relative">
              
              {/* 1. Product Name Block Element */}
              <div className="w-full mb-3 pb-3 border-b border-gray-200">
                <h3 className="font-bold text-lg text-gray-800 flex flex-wrap items-center gap-2">
                  <span className="flex-1 break-words">{p.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs text-white shrink-0 ${totalStock > 0 ? 'bg-green-600' : 'bg-red-500'}`}>
                    {totalStock} in stock
                  </span>
                </h3>
              </div>

              {/* 2. Action Buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button 
                  onClick={() => setViewingLocationsProductId(viewingLocationsProductId === p.id ? '' : p.id)}
                  className="text-xs bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded hover:bg-blue-200 transition-colors"
                >
                  ℹ️ Locations
                </button>
                <button 
                  onClick={() => {
                    setQuickAddProductId(quickAddProductId === p.id ? '' : p.id);
                    setQuickAddLocationSearch('');
                    setQuickAddLocationId('');
                    setQuickAddQty('');
                  }} 
                  className="text-xs bg-green-100 text-green-700 font-bold px-3 py-1.5 rounded hover:bg-green-200 transition-colors"
                >
                  + Quick Add Stock
                </button>
                <button 
                  onClick={() => handleDeleteProduct(p.id)}
                  className="text-xs bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded hover:bg-red-200 transition-colors ml-auto"
                >
                  🗑️ Delete Product
                </button>
              </div>

              {/* Dynamic Action UIs */}
              {viewingLocationsProductId === p.id && (
                <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200 shadow-sm">
                  <p className="text-xs font-bold text-blue-800 mb-2">Stock Locations</p>
                  {p.inventory?.length > 0 ? (
                    <div className="space-y-1">
                      {p.inventory.map((inv: any) => (
                        <div key={inv.id} className="flex justify-between items-center bg-white p-1.5 rounded border border-blue-100 text-sm">
                          <span className="font-medium text-gray-700">{inv.location?.name}</span>
                          <span className="font-bold text-blue-600">{inv.quantity} units</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No stock found in any location.</p>
                  )}
                </div>
              )}

              {quickAddProductId === p.id && (
                <div className="mb-4 p-3 bg-white rounded border border-green-200 shadow-sm flex flex-col gap-3">
                  <p className="text-xs font-bold text-green-800">Add Stock to Location</p>
                  <input 
                    type="text" 
                    placeholder="Search Location..." 
                    className="border p-2 text-sm rounded w-full text-gray-900 bg-gray-50 focus:ring-2 focus:ring-green-500 outline-none"
                    value={quickAddLocationSearch}
                    onChange={e => {
                      setQuickAddLocationSearch(e.target.value);
                      const newFiltered = locations.filter(l => {
                        const terms = e.target.value.toLowerCase().split(/\s+/);
                        const searchable = `${l.name} ${l.uid}`.toLowerCase();
                        return terms.every(t => searchable.includes(t));
                      });
                      if (newFiltered.length === 1) {
                        setQuickAddLocationId(newFiltered[0].id);
                      } else if (newFiltered.length === 0 || !newFiltered.find(l => l.id === quickAddLocationId)) {
                        setQuickAddLocationId('');
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <select 
                      className="border p-2 text-sm rounded flex-1 text-gray-900 bg-white min-w-0"
                      value={quickAddLocationId}
                      onChange={e => setQuickAddLocationId(e.target.value)}
                    >
                      <option value="">-- Choose Location --</option>
                      {filteredLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <input 
                      type="number" 
                      min="1"
                      placeholder="Qty" 
                      className="border p-2 text-sm rounded w-20 text-gray-900 shrink-0"
                      value={quickAddQty}
                      onChange={e => setQuickAddQty(e.target.value)}
                    />
                    <button 
                      onClick={() => handleQuickAddStock(p.id)} 
                      className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 text-sm shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Aliases (Remaining space) */}
              {p.aliases.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Known Aliases:</p>
                  <div className="flex flex-wrap gap-2">
                    {p.aliases.map((a: any) => (
                      <span key={a.id} className="bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded flex items-center gap-1 shadow-sm border border-gray-300">
                        {a.alias}
                        <button onClick={() => handleDeleteAlias(a.id)} className="text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full w-4 h-4 flex items-center justify-center ml-1 transition-colors">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )})}
          {filteredProducts.length === 0 && <p className="text-gray-500 italic">No matches found.</p>}
        </div>
      </div>

      {/* Right Column: Aliases & Unmapped */}
      <div className="bg-orange-50 border border-orange-200 p-6 rounded-lg">
        <h2 className="text-xl font-bold text-orange-800 mb-2">Alias Engine</h2>
        <p className="text-sm text-orange-700 mb-6">Map raw names from your Google Sheets to Canonical Products here.</p>

        <div className="mb-6 p-4 bg-white rounded border border-orange-100 shadow-sm">
          <h3 className="font-bold mb-2">1. Select Target Product</h3>
          <select 
            className="w-full border p-2 rounded mb-4 text-gray-900 bg-white"
            value={selectedProductId}
            onChange={e => setSelectedProductId(e.target.value)}
          >
            <option value="">-- Choose a product --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <h3 className="font-bold mb-2">2. Add Custom Alias</h3>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="E.g., Formal Pants / Beige - XL" 
              className="border p-2 flex-1 rounded text-gray-900 bg-white placeholder-gray-400"
              value={newAlias}
              onChange={e => setNewAlias(e.target.value)}
            />
            <button onClick={() => handleAddAlias(newAlias)} className="bg-orange-600 text-white px-4 py-2 rounded font-bold hover:bg-orange-700">Add Alias</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded border border-orange-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold flex items-center gap-2">
              <span>Unmapped from Google Sheets</span>
              {!unmappedLoading && (
                <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded-full">{unmapped.length} found</span>
              )}
            </h3>
            <button 
              onClick={fetchUnmapped}
              disabled={unmappedLoading}
              className={`text-xs font-bold px-3 py-1.5 rounded transition ${unmappedLoading ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
            >
              {unmappedLoading ? '🔄 Syncing...' : '🔄 Sync Sheets'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">These products appeared in recent orders but aren't mapped to anything yet. Select a Target Product above, then click one of these to map it instantly.</p>
          
          <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto">
            {unmappedLoading && <p className="text-gray-500 italic text-sm">Connecting to Google Sheets...</p>}
            {!unmappedLoading && unmapped.length === 0 && <p className="text-gray-400 italic">Everything is perfectly mapped!</p>}
            {!unmappedLoading && unmapped.map((name, i) => (
              <button 
                key={i} 
                onClick={() => handleAddAlias(name)}
                className="bg-gray-100 hover:bg-orange-200 border border-gray-300 text-gray-700 text-sm px-3 py-1.5 rounded transition text-left"
                title="Click to map this alias"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
