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

  // Matrix Add State
  const [matrixLocationId, setMatrixLocationId] = useState('');
  const [matrixBaseName, setMatrixBaseName] = useState('');
  const [matrixColors, setMatrixColors] = useState<string[]>([]);
  const [matrixSizes, setMatrixSizes] = useState<string[]>([]);
  const [matrixData, setMatrixData] = useState<{ [color: string]: { [size: string]: string } }>({});
  const [newColorInput, setNewColorInput] = useState('');
  const [newSizeInput, setNewSizeInput] = useState('');
  const [isUpdatingMatrix, setIsUpdatingMatrix] = useState(false);

  // Dictionary Editor Modal State
  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [aliasModalType, setAliasModalType] = useState<'base' | 'color' | 'size' | null>(null);
  const [aliasModalName, setAliasModalName] = useState('');
  const [aliasModalAliases, setAliasModalAliases] = useState<string[]>([]);
  const [newAliasInput, setNewAliasInput] = useState('');
  const [dictionaries, setDictionaries] = useState<{ base: any[], color: any[], size: any[] }>({ base: [], color: [], size: [] });

  useEffect(() => {
    fetchLocations();
  }, []);

  // Robust pre-fill using useEffect (Modified to just set colors/sizes if they are completely empty)
  useEffect(() => {
    if (matrixBaseName && matrixLocationId && products.length > 0) {
      // Re-derive baseProductsMap strictly for this effect since it's above the main derivation
      const localMap = new Map<string, { colors: Set<string>, sizes: Set<string> }>();
      products.forEach(p => {
        const parts = p.name.split(' - ');
        if (parts.length >= 2) {
          const base = parts[0].trim();
          const detailsStr = parts.slice(1).join(' - ');
          let details = detailsStr.split(' / ');
          if (details.length < 2) details = detailsStr.split(',');
          
          if (details.length >= 2) {
            if (!localMap.has(base)) localMap.set(base, { colors: new Set(), sizes: new Set() });
            localMap.get(base)!.colors.add(details[0].trim());
            localMap.get(base)!.sizes.add(details[1].trim());
          }
        }
      });
      // The additive logic removes the need for pre-filling matrixData with absolute quantities.
    }
  }, [matrixBaseName, matrixLocationId, locations, products]); // intentionally excluding matrixData to prevent looping

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const [locRes, prodRes, baseRes, colorRes, sizeRes] = await Promise.all([
        fetch('/api/inventory/locations'),
        fetch('/api/inventory/products'),
        fetch('/api/dictionary?type=base'),
        fetch('/api/dictionary?type=color'),
        fetch('/api/dictionary?type=size')
      ]);
      const locData = await locRes.json();
      const prodData = await prodRes.json();
      const baseData = await baseRes.json();
      const colorData = await colorRes.json();
      const sizeData = await sizeRes.json();
      
      if (locData.success) setLocations(locData.data);
      if (prodData.success) setProducts(prodData.data);
      
      setDictionaries({
        base: baseData.success ? baseData.data : [],
        color: colorData.success ? colorData.data : [],
        size: sizeData.success ? sizeData.data : []
      });
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

  // Base Products Derivation
  const baseProductsMap = new Map<string, { colors: Set<string>, sizes: Set<string> }>();
  products.forEach(p => {
    const parts = p.name.split(' - ');
    if (parts.length >= 2) {
      const base = parts[0].trim();
      const detailsStr = parts.slice(1).join(' - ');
      let details = detailsStr.split(' / ');
      if (details.length < 2) details = detailsStr.split(',');

      if (details.length >= 2) {
        const color = details[0].trim();
        const size = details[1].trim();
        if (!baseProductsMap.has(base)) baseProductsMap.set(base, { colors: new Set(), sizes: new Set() });
        baseProductsMap.get(base)!.colors.add(color);
        baseProductsMap.get(base)!.sizes.add(size);
      }
    }
  });
  const baseProductNames = Array.from(baseProductsMap.keys());

  // Matrix Handlers
  const handleMatrixBaseNameSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMatrixBaseName(val);
    if (baseProductsMap.has(val)) {
      const data = baseProductsMap.get(val)!;
      let colors = Array.from(data.colors);
      let sizes = Array.from(data.sizes);
      
      const dict = dictionaries.base.find(b => b.name === val);
      if (dict) {
         if (dict.colorOrder && dict.colorOrder.length > 0) {
            colors.sort((a, b) => {
              const idxA = dict.colorOrder.indexOf(a);
              const idxB = dict.colorOrder.indexOf(b);
              if (idxA === -1 && idxB === -1) return 0;
              if (idxA === -1) return 1;
              if (idxB === -1) return -1;
              return idxA - idxB;
            });
         }
         if (dict.sizeOrder && dict.sizeOrder.length > 0) {
            sizes.sort((a, b) => {
              const idxA = dict.sizeOrder.indexOf(a);
              const idxB = dict.sizeOrder.indexOf(b);
              if (idxA === -1 && idxB === -1) return 0;
              if (idxA === -1) return 1;
              if (idxB === -1) return -1;
              return idxA - idxB;
            });
         }
      }
      
      setMatrixColors(colors);
      setMatrixSizes(sizes);
      setMatrixData({}); // Clear so useEffect can prefill
    } else {
      setMatrixColors([]);
      setMatrixSizes([]);
      setMatrixData({});
    }
  };

  const saveOrder = async (colors: string[], sizes: string[]) => {
    try {
       await fetch('/api/dictionary', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           type: 'base', action: 'update_order', name: matrixBaseName, colorOrder: colors, sizeOrder: sizes
         })
       });
       // Silently update dictionaries state so the UI stays in sync without a full reload
       setDictionaries(prev => {
         const exists = prev.base.find(b => b.name === matrixBaseName);
         if (exists) {
           return {
             ...prev,
             base: prev.base.map(b => b.name === matrixBaseName ? { ...b, colorOrder: colors, sizeOrder: sizes } : b)
           };
         } else {
           return {
             ...prev,
             base: [...prev.base, { id: 'temp', name: matrixBaseName, aliases: [], colorOrder: colors, sizeOrder: sizes } as any]
           };
         }
       });
    } catch (e) {
       console.error("Failed to save order", e);
    }
  };

  const handleMoveColor = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === matrixColors.length - 1) return;
    const newColors = [...matrixColors];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newColors[idx], newColors[swapIdx]] = [newColors[swapIdx], newColors[idx]];
    setMatrixColors(newColors);
    saveOrder(newColors, matrixSizes);
  };

  const handleMoveSize = (idx: number, direction: 'left' | 'right') => {
    if (direction === 'left' && idx === 0) return;
    if (direction === 'right' && idx === matrixSizes.length - 1) return;
    const newSizes = [...matrixSizes];
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    [newSizes[idx], newSizes[swapIdx]] = [newSizes[swapIdx], newSizes[idx]];
    setMatrixSizes(newSizes);
    saveOrder(matrixColors, newSizes);
  };


  const handleAddColor = () => {
    if (newColorInput.trim() && !matrixColors.includes(newColorInput.trim())) {
      setMatrixColors([...matrixColors, newColorInput.trim()]);
      setNewColorInput('');
    }
  };

  const handleAddSize = () => {
    if (newSizeInput.trim() && !matrixSizes.includes(newSizeInput.trim())) {
      setMatrixSizes([...matrixSizes, newSizeInput.trim()]);
      setNewSizeInput('');
    }
  };

  const handleRemoveColor = (col: string) => {
    setMatrixColors(matrixColors.filter(c => c !== col));
    const newData = { ...matrixData };
    delete newData[col];
    setMatrixData(newData);
  };

  const handleRemoveSize = (sz: string) => {
    setMatrixSizes(matrixSizes.filter(s => s !== sz));
    const newData = { ...matrixData };
    Object.keys(newData).forEach(c => {
      delete newData[c][sz];
    });
    setMatrixData(newData);
  };

  const handleMatrixQtyChange = (col: string, sz: string, val: string) => {
    setMatrixData(prev => ({
      ...prev,
      [col]: {
        ...(prev[col] || {}),
        [sz]: val
      }
    }));
  };

  const handleMatrixUpdate = async (locId: string) => {
    if (!matrixBaseName.trim()) return alert("Please select or enter a Base Product Name.");
    if (matrixColors.length === 0 || matrixSizes.length === 0) return alert("Please add at least one color and one size.");

    const updates = [];
    for (const color of matrixColors) {
      for (const size of matrixSizes) {
        const qty = matrixData[color]?.[size] || '';
        updates.push({ color, size, quantity: qty });
      }
    }

    if (updates.length === 0) return alert("Please add at least one color and size.");

    setIsUpdatingMatrix(true);
    try {
      const res = await fetch('/api/inventory/stock-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: locId,
          baseName: matrixBaseName.trim(),
          updates
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully updated matrix inventory!`);
        fetchLocations();
        setMatrixData({});
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred during update.");
    }
    setIsUpdatingMatrix(false);
  };

  const openAliasModal = (type: 'base' | 'color' | 'size', name: string) => {
    setAliasModalType(type);
    setAliasModalName(name);
    
    // Find existing aliases
    const dict = dictionaries[type].find(d => d.name === name);
    setAliasModalAliases(dict ? dict.aliases : []);
    setNewAliasInput('');
    setAliasModalOpen(true);
  };

  const handleSaveAliases = async () => {
    if (!aliasModalType || !aliasModalName) return;
    try {
      const res = await fetch('/api/dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: aliasModalType,
          action: 'update_aliases',
          name: aliasModalName,
          aliases: aliasModalAliases
        })
      });
      const data = await res.json();
      if (data.success) {
        setAliasModalOpen(false);
        fetchLocations(); // Refresh dictionaries
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save aliases.");
    }
  };

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
                  <div className="flex gap-2 flex-col items-end">
                    <button 
                      onClick={() => {
                        setQuickAddLocationId(quickAddLocationId === loc.id ? '' : loc.id);
                        setQuickAddProductSearch('');
                        setQuickAddProductId('');
                        setQuickAddQty('');
                      }} 
                      className="text-xs bg-green-100 text-green-700 font-bold px-2 py-1 rounded hover:bg-green-200 w-full"
                    >
                      + Add Stock
                    </button>
                    <button 
                      onClick={() => {
                        setMatrixLocationId(loc.id);
                        setQuickAddLocationId('');
                        setMatrixBaseName('');
                        setMatrixColors([]);
                        setMatrixSizes([]);
                        setMatrixData({});
                      }} 
                      className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-1 rounded hover:bg-purple-200 w-full"
                    >
                      + Matrix Update
                    </button>
                  </div>
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

      {/* MATRIX UPDATE WIDE POPUP MODAL */}
      {matrixLocationId && (() => {
        const selectedLoc = locations.find(l => l.id === matrixLocationId);
        if (!selectedLoc) return null;

        return (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-5xl h-[95vh] overflow-hidden border border-purple-200">
              
              {/* Modal Header */}
              <div className="bg-blue-900 text-white p-4 flex gap-6 items-start justify-between shrink-0">
                <div className="shrink-0 pt-1">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <span className="text-xl">🧮</span> Matrix Stock Update
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-blue-200 text-sm font-medium">Location:</p>
                    <select 
                      className="bg-blue-800 text-white border border-blue-700 text-sm font-bold rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer hover:bg-blue-700"
                      value={matrixLocationId}
                      onChange={(e) => setMatrixLocationId(e.target.value)}
                    >
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="flex-1 max-w-xl relative">
                  <div className="flex justify-between items-end mb-1">
                    <label className="block text-sm font-bold text-blue-100">Select Base Product Name</label>
                    {matrixBaseName && (
                      <button 
                        onClick={() => openAliasModal('base', matrixBaseName)}
                        className="text-xs bg-orange-500 hover:bg-orange-400 text-white px-2 py-1 rounded font-bold transition-colors shadow-sm"
                      >
                        ⚙️ Edit Aliases
                      </button>
                    )}
                  </div>
                  <input 
                    type="text" 
                    list="base-products-list"
                    placeholder="e.g. Formal Pants" 
                    className="border-none p-2 rounded w-full text-gray-900 bg-white font-bold text-lg shadow-inner focus:ring-2 focus:ring-blue-400 outline-none transition-all"
                    value={matrixBaseName}
                    onChange={handleMatrixBaseNameSelect}
                  />
                  <datalist id="base-products-list">
                    {baseProductNames.map(b => <option key={b} value={b} />)}
                  </datalist>
                </div>

                <button 
                  onClick={() => setMatrixLocationId('')} 
                  className="shrink-0 text-blue-200 hover:text-white bg-blue-950/50 hover:bg-blue-950 rounded-full w-10 h-10 flex items-center justify-center text-xl transition-colors mt-1"
                >
                  ✕
                </button>
              </div>
              
              {/* Modal Body */}
              <div className="p-4 flex-1 bg-gray-50 flex flex-col min-h-0">

                {matrixBaseName && (
                  <div className="bg-white p-1 rounded-lg border border-gray-200 shadow-sm flex-1 min-h-0 flex flex-col">
                    <div className="overflow-auto flex-1">
                      <table className="w-full text-sm text-left border-collapse bg-white">
                        <thead className="bg-gray-100 text-gray-700 select-none">
                          <tr>
                            <th className="p-3 border-r border-b font-bold whitespace-nowrap bg-gray-200 shadow-inner sticky top-0 left-0 z-30 text-gray-600">
                              Color \ Size
                            </th>
                            {matrixSizes.map((sz, idx) => (
                              <th key={sz} className="p-3 border-r border-b min-w-[100px] text-center relative group bg-gray-100 sticky top-0 z-20">
                                <div className="flex justify-between items-center px-4">
                                  <button onClick={() => handleMoveSize(idx, 'left')} className="text-gray-400 hover:text-gray-800 text-xs opacity-0 group-hover:opacity-100 transition-opacity">⬅️</button>
                                  <div className="flex flex-col items-center justify-center gap-1 mx-2">
                                    <span className="font-bold text-gray-800 text-base">{sz}</span>
                                    <button 
                                      onClick={() => openAliasModal('size', sz)}
                                      className="text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded font-bold opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 left-1"
                                      title="Edit Aliases"
                                    >
                                      ⚙️
                                    </button>
                                  </div>
                                  <button onClick={() => handleMoveSize(idx, 'right')} className="text-gray-400 hover:text-gray-800 text-xs opacity-0 group-hover:opacity-100 transition-opacity">➡️</button>
                                </div>
                                <button 
                                  onClick={() => handleRemoveSize(sz)} 
                                  className="absolute top-1 right-1 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded w-5 h-5 flex items-center justify-center text-[10px] transition-opacity" 
                                  title="Remove Size Column"
                                >
                                  ✕
                                </button>
                              </th>
                            ))}
                            <th className="p-2 border-b min-w-[120px] bg-purple-50/50 sticky top-0 z-20">
                              <div className="flex gap-1 items-center bg-white border rounded p-1 shadow-sm">
                                <input 
                                  type="text" 
                                  placeholder="New Size" 
                                  className="px-2 py-1 w-full text-xs text-gray-900 outline-none font-bold placeholder-gray-400" 
                                  value={newSizeInput} 
                                  onChange={e=>setNewSizeInput(e.target.value)} 
                                  onKeyDown={e => e.key === 'Enter' && handleAddSize()} 
                                />
                                <button 
                                  onClick={handleAddSize} 
                                  className="bg-purple-600 text-white hover:bg-purple-700 px-3 py-1 rounded text-xs font-bold transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrixColors.map((col, rIdx) => (
                            <tr key={col} className={`border-b hover:bg-blue-50 transition-colors ${rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                              <td className="p-3 border-r font-bold relative group text-gray-800 whitespace-nowrap bg-inherit z-10 sticky left-0">
                                <div className="flex items-center gap-3">
                                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleMoveColor(rIdx, 'up')} className="text-gray-400 hover:text-gray-800 text-[10px] leading-none">⬆️</button>
                                    <button onClick={() => handleMoveColor(rIdx, 'down')} className="text-gray-400 hover:text-gray-800 text-[10px] leading-none">⬇️</button>
                                  </div>
                                  <span>{col}</span>
                                  <button 
                                    onClick={() => openAliasModal('color', col)}
                                    className="text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Edit Aliases"
                                  >
                                    ⚙️
                                  </button>
                                </div>
                                <button 
                                  onClick={() => handleRemoveColor(col)} 
                                  className="absolute top-1/2 -translate-y-1/2 right-2 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded w-5 h-5 flex items-center justify-center text-[10px] transition-opacity" 
                                  title="Remove Color Row"
                                >
                                  ✕
                                </button>
                              </td>
                              {matrixSizes.map(sz => {
                                const pNameSlash = `${matrixBaseName} - ${col} / ${sz}`;
                                const pNameComma = `${matrixBaseName} - ${col}, ${sz}`;
                                const product = products.find(p => p.name === pNameSlash || p.name === pNameComma);
                                const inv = product?.inventory?.find((i:any) => i.locationId === matrixLocationId);
                                const currentStock = inv ? inv.quantity : 0;
                                
                                const userDiff = matrixData[col]?.[sz] !== undefined ? matrixData[col][sz] : '';
                                const isPopulated = userDiff !== '';
                                
                                // Show preview of new stock
                                const diffNum = parseInt(userDiff);
                                const previewStock = (!isNaN(diffNum)) ? currentStock + diffNum : currentStock;

                                const hasStock = currentStock > 0;
                                const placeholderStyle = hasStock ? 'placeholder:text-blue-500 placeholder:font-bold' : 'placeholder:text-gray-300';

                                return (
                                  <td key={sz} className={`p-1.5 border-r text-center ${isPopulated ? 'bg-blue-50/50' : ''}`}>
                                    <div className="flex flex-col">
                                      <input 
                                        type="number" 
                                        placeholder={currentStock.toString()}
                                        className={`w-full border rounded p-2 text-center focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all font-semibold ${placeholderStyle} ${isPopulated ? 'text-blue-700 bg-white border-blue-200' : 'text-gray-900 bg-gray-50 border-gray-200'}`}
                                        value={userDiff}
                                        onChange={e => handleMatrixQtyChange(col, sz, e.target.value)}
                                      />
                                      {isPopulated && (
                                        <span className={`text-[10px] mt-1 font-bold ${previewStock < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                          Final: {previewStock}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="bg-gray-50"></td>
                            </tr>
                          ))}
                          <tr>
                            <td className="p-2 border-r bg-purple-50/50 sticky left-0 z-10">
                              <div className="flex gap-1 items-center bg-white border rounded p-1 shadow-sm">
                                <input 
                                  type="text" 
                                  placeholder="New Color" 
                                  className="px-2 py-1 w-full text-xs text-gray-900 outline-none font-bold placeholder-gray-400" 
                                  value={newColorInput} 
                                  onChange={e=>setNewColorInput(e.target.value)} 
                                  onKeyDown={e => e.key === 'Enter' && handleAddColor()} 
                                />
                                <button 
                                  onClick={handleAddColor} 
                                  className="bg-purple-600 text-white hover:bg-purple-700 px-3 py-1 rounded text-xs font-bold transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td colSpan={matrixSizes.length + 1} className="bg-gray-50"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Modal Footer */}
              {matrixBaseName && (
                <div className="bg-gray-100 p-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
                  <button 
                    onClick={() => setMatrixLocationId('')}
                    className="px-6 py-2.5 rounded font-bold text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleMatrixUpdate(selectedLoc.id)} 
                    disabled={isUpdatingMatrix}
                    className="bg-purple-600 text-white px-8 py-2.5 rounded font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-md"
                  >
                    {isUpdatingMatrix ? "Saving Changes..." : "Save Stock Updates"}
                  </button>
                </div>
              )}
              
            </div>
          </div>
        );
      })()}

      {/* ALIAS EDITOR MODAL */}
      {aliasModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-lg border border-orange-200">
            <div className="bg-orange-600 text-white p-4 flex justify-between items-center rounded-t-xl">
              <h2 className="text-xl font-bold">Edit Aliases: <span className="font-black text-orange-100">{aliasModalName}</span> ({aliasModalType})</h2>
              <button onClick={() => setAliasModalOpen(false)} className="text-white hover:text-gray-200 font-bold">✕</button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Add similar names that should automatically map to <strong>{aliasModalName}</strong> during Google Sheet import.
                For example, if the sheet says "XXL", it can map to "2XL".
              </p>
              
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  className="border border-gray-300 p-2 flex-1 rounded text-gray-900 bg-white font-medium placeholder-gray-400" 
                  placeholder="Type an alias name..."
                  value={newAliasInput}
                  onChange={e => setNewAliasInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newAliasInput.trim()) {
                      if (!aliasModalAliases.includes(newAliasInput.trim())) {
                        setAliasModalAliases([...aliasModalAliases, newAliasInput.trim()]);
                      }
                      setNewAliasInput('');
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    if (newAliasInput.trim() && !aliasModalAliases.includes(newAliasInput.trim())) {
                      setAliasModalAliases([...aliasModalAliases, newAliasInput.trim()]);
                    }
                    setNewAliasInput('');
                  }}
                  className="bg-orange-100 text-orange-800 font-bold px-4 py-2 rounded hover:bg-orange-200"
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {aliasModalAliases.map(alias => (
                  <span key={alias} className="bg-gray-100 border border-gray-300 px-3 py-1 rounded-full text-sm flex items-center gap-2 text-gray-900">
                    {alias}
                    <button 
                      onClick={() => setAliasModalAliases(aliasModalAliases.filter(a => a !== alias))}
                      className="text-gray-500 hover:text-red-500 font-bold"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {aliasModalAliases.length === 0 && (
                  <span className="text-gray-400 italic text-sm">No aliases defined.</span>
                )}
              </div>
            </div>

            <div className="bg-gray-100 p-4 border-t border-gray-200 flex justify-end gap-3 rounded-b-xl">
              <button 
                onClick={() => setAliasModalOpen(false)}
                className="px-6 py-2 rounded font-bold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveAliases} 
                className="bg-orange-600 text-white px-8 py-2 rounded font-bold hover:bg-orange-700 transition-colors"
              >
                Save Aliases
              </button>
            </div>
          </div>
        </div>
      )}

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
