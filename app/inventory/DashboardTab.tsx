"use client";

import React, { useState, useEffect } from 'react';

export default function DashboardTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/inventory/dashboard');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) return <div>Loading dashboard...</div>;
  if (!data) return <div>Failed to load dashboard.</div>;

  return (
    <div className="space-y-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg shadow-sm">
          <p className="text-xs font-bold text-blue-800 uppercase">Total Products</p>
          <p className="text-3xl font-black text-blue-600 mt-1">{data.totalProducts}</p>
          <p className="text-xs text-blue-600 mt-1">{data.totalProductQuantity} units in stock</p>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg shadow-sm">
          <p className="text-xs font-bold text-purple-800 uppercase">Total Supplies</p>
          <p className="text-3xl font-black text-purple-600 mt-1">{data.totalSupplies}</p>
          <p className="text-xs text-purple-600 mt-1">{data.totalSupplyQuantity} units in stock</p>
        </div>

        <div className="bg-green-50 border border-green-200 p-4 rounded-lg shadow-sm">
          <p className="text-xs font-bold text-green-800 uppercase">Total Locations</p>
          <p className="text-3xl font-black text-green-600 mt-1">{data.totalLocations}</p>
          <p className="text-xs text-green-600 mt-1">Active storage areas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white border border-red-200 p-4 rounded-lg shadow-sm">
          <h2 className="text-lg font-bold text-red-700 mb-3 flex items-center gap-2">
            <span>⚠️</span> Low Stock Alerts (≤ 5 units)
          </h2>
          {data.lowStockItems.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No low stock items!</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {data.lowStockItems.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center p-2 bg-red-50 rounded border border-red-100">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.type}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${item.totalQty === 0 ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'}`}>
                    {item.totalQty} in stock
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently Updated Locations */}
        <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>📍</span> Recently Updated Locations
          </h2>
          {data.recentlyUpdatedLocations.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {data.recentlyUpdatedLocations.map((loc: any) => (
                <div key={loc.id} className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-100">
                  <p className="font-bold text-sm text-gray-900">{loc.name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(loc.lastUpdate).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
