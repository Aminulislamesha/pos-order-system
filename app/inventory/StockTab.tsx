"use client";

import React, { useState, useEffect } from 'react';

export default function StockTab() {
  const [locations, setLocations] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [action, setAction] = useState('ADD');
  const [reason, setReason] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
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

  const handleStockUpdate = async () => {
    if (!selectedProductId || !selectedLocationId || !quantity) return alert("Fill all required fields");
    try {
      const res = await fetch('/api/inventory/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductId,
          locationId: selectedLocationId,
          action,
          quantity,
          reason
        })
      });
      const data = await res.json();
      if (data.success) {
        setQuantity('');
        setReason('');
        fetchData(); // Refresh UI
        alert("Stock updated successfully!");
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div>Loading stock data...</div>;

  const filteredProducts = products.filter(p => {
    if (!searchQuery.trim()) return true;
    const terms = searchQuery.toLowerCase().split(/\s+/);
    const searchableString = `${p.name} ${p.type || ''} ${p.aliases?.map((a:any) => a.alias).join(' ') || ''}`.toLowerCase();
    return terms.every(term => searchableString.includes(term));
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Search Bar for entire tab */}
      <div className="md:col-span-3">
        <input 
          type="text" 
          placeholder="🔍 Fast Search Product (e.g., formal black XL)... this filters the dropdown below and the stock overview" 
          className="w-full border-2 border-blue-200 p-3 rounded-lg text-gray-900 bg-white placeholder-gray-500 font-bold shadow-sm"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value);
            // If the search yields exactly 1 result and user hasn't selected it, auto-select it for speed
            const newFiltered = products.filter(p => {
              const terms = e.target.value.toLowerCase().split(/\s+/);
              const searchableString = `${p.name} ${p.type || ''} ${p.aliases?.map((a:any) => a.alias).join(' ') || ''}`.toLowerCase();
              return terms.every(term => searchableString.includes(term));
            });
            if (newFiltered.length === 1) {
              setSelectedProductId(newFiltered[0].id);
            } else if (newFiltered.length === 0 || !newFiltered.find(p => p.id === selectedProductId)) {
              setSelectedProductId('');
            }
          }}
        />
      </div>

      {/* Update Stock Form */}
      <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg h-fit text-gray-900">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Update Stock</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-bold mb-1 text-gray-800">Product</label>
          <select 
            className="w-full border p-2 rounded text-gray-900 bg-white"
            value={selectedProductId}
            onChange={e => setSelectedProductId(e.target.value)}
          >
            <option value="">-- Choose Product --</option>
            {filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold mb-1 text-gray-800">Location</label>
          <select 
            className="w-full border p-2 rounded text-gray-900 bg-white"
            value={selectedLocationId}
            onChange={e => setSelectedLocationId(e.target.value)}
          >
            <option value="">-- Choose Location --</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-bold mb-1 text-gray-800">Action</label>
            <select 
              className="w-full border p-2 rounded text-gray-900 bg-white"
              value={action}
              onChange={e => setAction(e.target.value)}
            >
              <option value="ADD">Add Stock (+)</option>
              <option value="DEDUCT">Deduct Stock (-)</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-bold mb-1 text-gray-800">Quantity</label>
            <input 
              type="number" 
              min="1"
              placeholder="e.g., 5"
              className="w-full border p-2 rounded text-gray-900 bg-white placeholder-gray-400"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold mb-1 text-gray-800">Reason / Note (Optional)</label>
          <input 
            type="text" 
            placeholder="e.g., New shipment arrived"
            className="w-full border p-2 rounded text-gray-900 bg-white placeholder-gray-400"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <button 
          onClick={handleStockUpdate} 
          className={`w-full text-white px-4 py-2 rounded font-bold transition-colors ${action === 'ADD' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
        >
          {action === 'ADD' ? 'Add Stock' : 'Deduct Stock'}
        </button>
      </div>

      {/* Stock Overview */}
      <div className="md:col-span-2">
        <h2 className="text-xl font-bold mb-4">Current Stock Overview</h2>
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {filteredProducts.map(p => {
            const totalStock = p.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
            
            return (
              <div key={p.id} className="border border-gray-200 p-4 rounded-lg bg-white shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-lg text-gray-800">{p.name}</h3>
                  <div className={`px-3 py-1 rounded-full text-sm font-bold ${totalStock > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Total: {totalStock}
                  </div>
                </div>
                
                {p.inventory.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {p.inventory.map((inv: any) => (
                      <div key={inv.id} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded border border-gray-100">
                        <span className="font-semibold text-gray-600">{inv.location.name}</span>
                        <span className="font-mono bg-gray-200 px-2 py-0.5 rounded text-gray-800">{inv.quantity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No stock in any location.</p>
                )}
              </div>
            );
          })}
          {filteredProducts.length === 0 && <p className="text-gray-500 italic">No products available.</p>}
        </div>
      </div>
    </div>
  );
}
