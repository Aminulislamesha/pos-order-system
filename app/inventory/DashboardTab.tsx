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

        {/* Deduction History */}
        <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>📉</span> Recent Deductions (Last 3 Days)
          </h2>
          {(() => {
            const logs = data.deductionLogs || [];
            if (logs.length === 0) return <p className="text-sm text-gray-500 italic">No recent deductions.</p>;

            const batches: any[] = [];
            let currentBatch = { time: logs[0].createdAt, items: [logs[0]] };

            for (let i = 1; i < logs.length; i++) {
              const log = logs[i];
              const diffMs = Math.abs(new Date(currentBatch.time).getTime() - new Date(log.createdAt).getTime());
              
              if (diffMs <= 10000) {
                currentBatch.items.push(log);
              } else {
                batches.push(currentBatch);
                currentBatch = { time: log.createdAt, items: [log] };
              }
            }
            batches.push(currentBatch);

            return (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {batches.map((batch, batchIdx) => {
                  const totalItems = batch.items.reduce((sum: number, i: any) => sum + i.quantity, 0);
                  
                  // Group items inside this batch by location
                  const byLoc = new Map<string, { locName: string, products: {name: string, qty: number}[] }>();
                  batch.items.forEach((item: any) => {
                    const locId = item.location?.id || 'unknown';
                    const locName = item.location?.name || 'Unknown Location';
                    if (!byLoc.has(locId)) byLoc.set(locId, { locName, products: [] });
                    byLoc.get(locId)!.products.push({ name: item.product?.name, qty: item.quantity });
                  });

                  return (
                    <details key={batchIdx} className="bg-gray-50 border border-gray-200 rounded-lg group">
                      <summary className="p-3 font-bold text-sm text-gray-800 cursor-pointer flex justify-between items-center list-none select-none hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                            {new Date(batch.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span>{totalItems} items deducted</span>
                        </div>
                        <span className="text-gray-400 group-open:rotate-90 transition-transform">▶</span>
                      </summary>
                      <div className="p-3 border-t border-gray-200 bg-white">
                        {Array.from(byLoc.values()).map((locGroup, lgIdx) => (
                          <div key={lgIdx} className="mb-3 last:mb-0">
                            <h4 className="text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">{locGroup.locName}</h4>
                            <div className="space-y-1 pl-2 border-l-2 border-gray-200">
                              {locGroup.products.map((p, pIdx) => (
                                <div key={pIdx} className="flex justify-between text-sm">
                                  <span className="text-gray-800">{p.name}</span>
                                  <span className="font-medium text-gray-600">{p.qty} pcs</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
