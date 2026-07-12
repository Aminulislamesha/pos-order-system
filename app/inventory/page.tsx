"use client";

import React, { useState } from 'react';
import ProductsTab from './ProductsTab';
import LocationsTab from './LocationsTab';
import StockTab from './StockTab';
import DashboardTab from './DashboardTab';

export default function InventoryDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'locations' | 'stock'>('dashboard');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'MERGE' | 'OVERWRITE'>('MERGE');
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('mode', importMode);
      
      const res = await fetch('/api/inventory/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert("Import successful! " + (data.message || ''));
        setShowImportModal(false);
        setImportFile(null);
        window.location.reload(); // Refresh everything
      } else {
        alert("Import failed: " + data.error);
      }
    } catch (e) {
      alert("Error occurred during import");
      console.error(e);
    }
    setImporting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 print:p-0 print:bg-white font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6 print:hidden">
          <h1 className="text-3xl font-bold text-gray-800">📦 Inventory Management</h1>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowImportModal(true)} 
              className="bg-blue-600 text-white px-4 py-2 rounded-md font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-2"
            >
              <span>📥</span> Import Excel
            </button>
            <a href="/api/inventory/export" download className="bg-green-600 text-white px-4 py-2 rounded-md font-bold hover:bg-green-700 transition shadow-sm flex items-center gap-2">
              <span>📊</span> Export Excel
            </a>
            <a href="/" className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md font-semibold hover:bg-gray-300 transition shadow-sm">
              ← Back to POS
            </a>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm border border-gray-200 mb-6 w-fit print:hidden">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`px-6 py-2.5 rounded-md font-bold transition-all text-sm ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            📊 Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('products')} 
            className={`px-6 py-2.5 rounded-md font-bold transition-all text-sm ${activeTab === 'products' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            Products & Aliases
          </button>
          <button 
            onClick={() => setActiveTab('locations')} 
            className={`px-6 py-2.5 rounded-md font-bold transition-all text-sm ${activeTab === 'locations' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            Locations
          </button>
          <button 
            onClick={() => setActiveTab('stock')} 
            className={`px-6 py-2.5 rounded-md font-bold transition-all text-sm ${activeTab === 'stock' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            Stock Levels
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 print:border-none print:shadow-none print:p-0">
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'products' && <ProductsTab />}
          {activeTab === 'locations' && <LocationsTab />}
          {activeTab === 'stock' && <StockTab />}
        </div>

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800">📥 Import Stock via Excel</h3>
                <button onClick={() => setShowImportModal(false)} className="text-gray-500 hover:text-black font-bold text-xl">&times;</button>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Upload an Excel (.xlsx) file with three columns: <b>Name</b>, <b>Location</b>, and <b>Quantity</b>.
                </p>
                <input 
                  type="file" 
                  accept=".xlsx"
                  className="mb-6 w-full border p-2 rounded text-gray-900 bg-gray-50"
                  onChange={e => setImportFile(e.target.files?.[0] || null)}
                />

                <p className="text-sm font-bold mb-2">Import Mode:</p>
                <div className="flex flex-col gap-3 mb-6">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="mode" 
                      value="MERGE" 
                      checked={importMode === 'MERGE'} 
                      onChange={() => setImportMode('MERGE')}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-bold text-gray-800">Merge with existing stock</span>
                      <p className="text-xs text-gray-500">Adds the quantities in the file to your current stock levels.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="mode" 
                      value="OVERWRITE" 
                      checked={importMode === 'OVERWRITE'} 
                      onChange={() => setImportMode('OVERWRITE')}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-bold text-red-600">Start over existing stock</span>
                      <p className="text-xs text-gray-500">Wipes all current products and stock, and replaces it entirely with the file contents. Use with caution!</p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 bg-gray-100 flex justify-end gap-2 rounded-b-xl">
                <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">Cancel</button>
                <button 
                  onClick={handleImport} 
                  disabled={!importFile || importing} 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold shadow disabled:bg-gray-400"
                >
                  {importing ? "Importing..." : "Run Import"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
