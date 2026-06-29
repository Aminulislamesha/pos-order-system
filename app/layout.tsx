"use client";

import { useEffect, useState } from "react";
import { QRCodeCanvas } from 'qrcode.react'; 
import { Html5QrcodeScanner } from 'html5-qrcode';

interface CellData {
  value: string;
  backgroundColor: string;
  textColor: string;
  strikethrough: boolean;
  note: string | null;
}

interface OrderRow {
  originalRowIndex: number;
  colA: string; 
  formattedDate: string; 
  colB: string;
  colC: string;
  cells: CellData[];
}

export default function POSDashboard() {
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderRow[]>([]);
  
  // Tracking Scans
  const [scannedIds, setScannedIds] = useState<string[]>([]); 
  const [scannedHistory, setScannedHistory] = useState<OrderRow[]>([]); 
  
  // Tracking Selection for Print Modal
  const [selectedForPrint, setSelectedForPrint] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"main" | "printFilter" | "scanner">("main");
  
  // Toggle for Scanner History
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [lastScannedOrder, setLastScannedOrder] = useState<OrderRow | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const formatGoogleDate = (serial: string | number) => {
    if (!serial) return "";
    const numericSerial = Number(serial);
    if (isNaN(numericSerial)) return String(serial); 
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const convertedDate = new Date(excelEpoch.getTime() + numericSerial * 86400000);
    return convertedDate.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatShortDate = (serial: string | number) => {
    if (!serial) return "";
    
    let dateObj: Date;
    const numericSerial = Number(serial);

    if (isNaN(numericSerial)) {
      dateObj = new Date(String(serial));
    } else {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      dateObj = new Date(excelEpoch.getTime() + numericSerial * 86400000);
    }

    if (isNaN(dateObj.getTime())) return String(serial);
    return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }); 
  };

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/orders");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const ordersWithDates = json.data.map((row: any) => ({
        ...row,
        formattedDate: formatGoogleDate(row.colA)
      }));

      setAllOrders(ordersWithDates);
      setScannedIds([]); 
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openFilteredView = () => {
    const filtered = allOrders.filter((row) => {
      const orderId = String(row.colB || "").trim();
      const notes = String(row.colC || "").trim();
      
      const isCyanInSheet = row.cells.some(c => c.backgroundColor === 'rgb(0, 255, 255)');
      const isLocallyScanned = scannedIds.includes(orderId);
      const isStrikethrough = row.cells.some(c => c.strikethrough === true);

      if (isCyanInSheet || isLocallyScanned || isStrikethrough) return false; 

      const isSC = orderId.startsWith("SC");
      const isNN = orderId.startsWith("NN-");
      
      if (isSC) return true; 
      if (isNN) {
        const isNotExcluded = !/hold|cancelled|cancel/i.test(notes);
        const hasRequiredCode = /\b(C|wa|WA|c|M|m)\b/.test(notes);
        return isNotExcluded && hasRequiredCode;
      }
      return false; 
    });

    const sorted = filtered.sort((a, b) => {
      const getTime = (serial: string | number) => {
        if (!serial) return 0;
        const num = Number(serial);
        if (isNaN(num)) {
          const parsed = new Date(String(serial)).getTime();
          return isNaN(parsed) ? 0 : parsed;
        } else {
          const excelEpoch = new Date(Date.UTC(1899, 11, 30));
          return excelEpoch.getTime() + num * 86400000;
        }
      };
      return getTime(a.colA) - getTime(b.colA); 
    });

    setFilteredOrders(sorted);
    setSelectedForPrint(sorted.map(r => r.colB)); 
    setLastSelectedIndex(null); 
    setActiveView("printFilter");
  };

  // Keyboard Scanner Effect
  useEffect(() => {
    if (activeView !== "scanner") return;
    let barcodeBuffer = "";
    let timeoutId: NodeJS.Timeout | null = null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && barcodeBuffer.length > 0) {
        const scannedCode = barcodeBuffer.trim();
        barcodeBuffer = ""; 
        processScannedCode(scannedCode);
        return;
      }
      if (e.key.length === 1) {
        barcodeBuffer += e.key;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => { barcodeBuffer = ""; }, 100); 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, allOrders, scannedIds]); 

  // Camera Scanner Effect (UPDATED FOR HIGH SPEED)
  useEffect(() => {
    if (activeView !== "scanner") return;
    const scanner = new Html5QrcodeScanner("reader", { qrbox: { width: 250, height: 250 }, fps: 5 }, false);
    
    scanner.render((decodedText) => {
      // 1. Instantly pause to prevent double scanning
      try { scanner.pause(true); } catch (err) {}

      // 2. Play success beep
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
      } catch (e) {
        console.warn("Audio not supported");
      }

      // 3. Process the code (updates UI and sends background fetch)
      processScannedCode(decodedText.trim());

      // 4. Force unpause exactly 1 second later, no matter what!
      setTimeout(() => {
        try { scanner.resume(); } catch (err) {}
      }, 1000);
      
    }, (error) => {});
    
    return () => { scanner.clear().catch(console.error); };
  }, [activeView]);

  // HIGH SPEED SCAN PROCESSOR
  const processScannedCode = (code: string) => {
    const orderExists = allOrders.find(o => o.colB === code);
    if (!orderExists) return; // Order not found in sheet
    
    // Check if already scanned locally to avoid duplicate UI entries
    if (scannedIds.includes(code)) return; 
    
    // Update local UI for the right-hand panel
    setScannedIds(prev => [...prev, code]);
    setLastScannedOrder(orderExists);
    setScannedHistory(prev => [orderExists, ...prev].slice(0, 10));
    setShowHistory(false);
    
    // FIRE AND FORGET: Send the update to Google Sheets but DO NOT wait for it to finish
    fetch("/api/scanner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "color", rowIndex: orderExists.originalRowIndex })
    }).catch(err => console.error("Failed to update Sheet color:", err));
  };

  const markAsPrinted = async () => {
    const rowsToProcess = filteredOrders.filter(r => selectedForPrint.includes(r.colB));
    if (rowsToProcess.length === 0) return alert("Please select at least one order to mark as printed.");
    
    if (!confirm(`Mark ${rowsToProcess.length} selected orders with a strikethrough in Google Sheets?`)) return;

    setIsLoading(true);
    try {
      const indices = rowsToProcess.map(r => r.originalRowIndex);
      await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "strikethrough", rowIndices: indices })
      });
      setActiveView("main");
      await fetchOrders();
    } catch (err) {
      alert("Error updating rows.");
      setIsLoading(false);
    }
  };

  const copyCyanRows = () => {
    const cyanRows = allOrders.filter(row => 
      scannedIds.includes(row.colB) || row.cells.some(c => c.backgroundColor === 'rgb(0, 255, 255)')
    );
    if (cyanRows.length === 0) return alert("No scanned/cyan rows to copy.");
    const textData = cyanRows.map(r => r.cells.map(c => c.value).join("\t")).join("\n");
    navigator.clipboard.writeText(textData);
    alert(`Copied ${cyanRows.length} cyan rows to clipboard!`);
  };

  const removeCyanRows = async () => {
    const cyanRows = allOrders.filter(row => 
      scannedIds.includes(row.colB) || row.cells.some(c => c.backgroundColor === 'rgb(0, 255, 255)')
    );
    if (cyanRows.length === 0) return alert("No scanned/cyan rows to delete.");
    if (!confirm(`Permanently delete ${cyanRows.length} cyan rows from Google Sheets?`)) return;

    setIsLoading(true);
    try {
      const indices = cyanRows.map(r => r.originalRowIndex);
      await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", rowIndices: indices })
      });
      await fetchOrders();
    } catch (err) {
      alert("Error deleting cyan rows.");
      setIsLoading(false);
    }
  };

  const cleanPhoneNumber = (phoneStr: string) => phoneStr ? phoneStr.replace(/^`/, '').trim() : "";
  
  const extractProducts = (cells: CellData[]) => {
    const products = [];
    for (let i = 11; i <= 21; i += 2) {
      const productName = cells[i]?.value;
      const productQty = cells[i + 1]?.value;
      if (productName && String(productName).trim() !== "" && productName !== "NaN") {
        products.push({ name: String(productName), qty: productQty ? String(productQty) : "1" });
      }
    }
    return products;
  };

  if (isLoading) return <div className="p-10 text-xl font-bold flex justify-center mt-20">Syncing with Google Sheets...</div>;
  if (error) return <div className="p-10 text-red-500 font-bold">Error: {error}</div>;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print { 
          @page { margin: 0; size: auto; } 
          body { margin: 0; padding: 0; } 
        }
      `}} />

      {/* ========================================== */}
      {/* VIEW 1: MAIN DASHBOARD                     */}
      {/* ========================================== */}
      {activeView === "main" && (
        <div className="min-h-screen bg-gray-50 p-8 font-sans print:hidden">
          <div className="max-w-[95%] mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold text-gray-800">NN Order Management Center</h1>
              <div className="flex gap-4">
                <button onClick={() => setActiveView("scanner")} className="bg-purple-600 text-white px-6 py-2 rounded-md font-bold hover:bg-purple-700 shadow-md">
                  📷 Start Scanning
                </button>
                <button onClick={openFilteredView} className="bg-blue-600 text-white px-6 py-2 rounded-md font-bold hover:bg-blue-700 shadow-md">
                  🖨️ Open Ready to Print
                </button>
                <button onClick={fetchOrders} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md font-semibold hover:bg-gray-300 transition shadow-sm">
                  Force Refresh Data
                </button>
              </div>
            </div>

            <div className="flex gap-4 mb-6 bg-cyan-50 p-4 border border-cyan-200 rounded-lg">
              <span className="font-bold text-cyan-800 flex items-center">Cyan Row Actions:</span>
              <button onClick={copyCyanRows} className="bg-cyan-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-cyan-700 shadow-sm">
                Copy All Cyan Rows
              </button>
              <button onClick={removeCyanRows} className="bg-red-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-red-700 shadow-sm">
                Delete All Cyan Rows from Sheet
              </button>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200 flex flex-col">
              <div className="bg-gray-800 text-white p-3 font-bold">Today (All Data)</div>
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-max text-left border-collapse">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      {allOrders.length > 0 && allOrders[0].cells.map((_, i) => (
                        <th key={i} className="p-4 border-b border-r last:border-r-0 whitespace-nowrap">Col {String.fromCharCode(65 + i)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allOrders.length === 0 ? (
                      <tr><td colSpan={30} className="p-8 text-center text-gray-500">No orders found.</td></tr>
                    ) : (
                      allOrders.map((row, index) => {
                        const isCyan = scannedIds.includes(row.colB) || row.cells.some(c => c.backgroundColor === 'rgb(0, 255, 255)');
                        return (
                          <tr key={index} className="hover:bg-gray-50 transition border-b">
                            {row.cells.map((cell, cellIndex) => (
                              <td 
                                key={cellIndex} 
                                className="p-2 border-r max-w-[300px] truncate"
                                title={cell.note || cell.value}
                                style={{ 
                                  backgroundColor: isCyan ? '#00FFFF' : (cell.backgroundColor !== 'transparent' ? cell.backgroundColor : 'inherit'),
                                  color: isCyan ? '#000000' : (cell.textColor !== 'transparent' ? cell.textColor : 'inherit'),
                                  textDecoration: cell.strikethrough ? 'line-through' : 'none'
                                }}
                              >
                                {cellIndex === 0 ? row.formattedDate : cell.value}
                              </td>
                            ))}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* VIEW 2: FILTERED & PRINT MODAL             */}
      {/* ========================================== */}
      {activeView === "printFilter" && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-90 z-50 flex flex-col p-8 print:hidden">
          <div className="bg-white flex-1 rounded-lg shadow-2xl flex flex-col overflow-hidden max-w-[95%] mx-auto w-full">
            <div className="bg-blue-800 text-white p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Ready to Print Orders</h2>
                <p className="text-blue-200 text-sm">{selectedForPrint.length} of {filteredOrders.length} orders selected.</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => window.print()} disabled={selectedForPrint.length === 0} className="bg-green-500 text-white px-6 py-3 rounded-md font-bold hover:bg-green-600 shadow-md text-lg disabled:bg-gray-500">
                  🖨️ Print Selected
                </button>
                <button onClick={markAsPrinted} disabled={selectedForPrint.length === 0} className="bg-red-500 text-white px-6 py-3 rounded-md font-bold hover:bg-red-600 shadow-md text-lg disabled:bg-gray-500">
                  ✏️ Mark as Printed (Strikethrough)
                </button>
                <button onClick={() => setActiveView("main")} className="bg-gray-300 text-gray-800 px-6 py-3 rounded-md font-bold hover:bg-gray-400 shadow-md">
                  Close X
                </button>
              </div>
            </div>

            <div className="overflow-x-auto w-full flex-1 bg-gray-50">
              <table className="w-full min-w-max text-left border-collapse">
                <thead className="bg-gray-200 text-gray-700 sticky top-0 shadow-sm">
                  <tr>
                    <th className="p-4 border-b border-r bg-gray-300 text-center select-none">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 cursor-pointer accent-blue-600"
                        checked={selectedForPrint.length === filteredOrders.length && filteredOrders.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedForPrint(filteredOrders.map(r => r.colB));
                          else setSelectedForPrint([]);
                          setLastSelectedIndex(null);
                        }}
                      />
                    </th>
                    {filteredOrders.length > 0 && filteredOrders[0].cells.map((_, i) => (
                      <th key={i} className="p-4 border-b border-r last:border-r-0 whitespace-nowrap bg-gray-200">Col {String.fromCharCode(65 + i)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={30} className="p-10 text-center text-xl text-gray-500">No orders match the print criteria.</td></tr>
                  ) : (
                    filteredOrders.map((row, index) => {
                      const isSelected = selectedForPrint.includes(row.colB);
                      return (
                        <tr key={index} className={`${isSelected ? 'bg-blue-50' : 'bg-white'} hover:bg-blue-100 transition border-b`}>
                          <td className="p-4 border-r text-center bg-gray-50 select-none">
                            <input 
                              type="checkbox" 
                              className="w-5 h-5 cursor-pointer accent-blue-600"
                              checked={isSelected}
                              onChange={(e: any) => {
                                const isChecking = e.target.checked;
                                const isShiftPressed = e.nativeEvent.shiftKey;

                                if (isShiftPressed && lastSelectedIndex !== null) {
                                  const start = Math.min(lastSelectedIndex, index);
                                  const end = Math.max(lastSelectedIndex, index);
                                  const rowsInRange = filteredOrders.slice(start, end + 1).map(r => r.colB);

                                  if (isChecking) {
                                    setSelectedForPrint(prev => Array.from(new Set([...prev, ...rowsInRange])));
                                  } else {
                                    setSelectedForPrint(prev => prev.filter(id => !rowsInRange.includes(id)));
                                  }
                                } else {
                                  if (isSelected) {
                                    setSelectedForPrint(prev => prev.filter(id => id !== row.colB));
                                  } else {
                                    setSelectedForPrint(prev => [...prev, row.colB]);
                                  }
                                }
                                setLastSelectedIndex(index);
                              }}
                            />
                          </td>
                          {row.cells.map((cell, cellIndex) => (
                            <td 
                              key={cellIndex} 
                              className="p-4 border-r last:border-r-0 max-w-[300px] truncate"
                              title={cell.note || cell.value}
                              style={{ 
                                backgroundColor: cell.backgroundColor !== 'transparent' ? cell.backgroundColor : 'inherit',
                                color: cell.textColor !== 'transparent' ? cell.textColor : 'inherit',
                                textDecoration: cell.strikethrough ? 'line-through' : 'none'
                              }}
                            >
                              {cellIndex === 0 ? row.formattedDate : cell.value}
                            </td>
                          ))}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* VIEW 3: CAMERA SCANNER MODAL               */}
      {/* ========================================== */}
      {activeView === "scanner" && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col p-4 print:hidden">
          <div className="flex justify-between items-center mb-4 bg-gray-900 p-4 rounded-lg">
            <h2 className="text-2xl font-bold text-white">📷 Package Scanner</h2>
            <button onClick={() => setActiveView("main")} className="bg-red-600 text-white px-6 py-2 rounded-md font-bold hover:bg-red-700 shadow-md">
              Close Scanner
            </button>
          </div>
          
          <div className="flex flex-col md:flex-row gap-6 flex-1 h-full overflow-hidden">
            <div className="flex-1 bg-gray-800 rounded-lg flex flex-col items-center justify-center p-4 border-4 border-gray-700">
               <div id="reader" className="w-full max-w-lg bg-black rounded-lg"></div>
               <p className="text-gray-400 mt-4 text-center">Use your camera or upload an image. Leave this screen open as long as you need to scan.</p>
            </div>
            
            {/* RIGHT PANEL: TOGGLE BETWEEN PREVIEW AND HISTORY */}
            <div className="w-full md:w-1/3 bg-gray-900 rounded-lg border-2 border-cyan-500 p-6 flex flex-col h-full overflow-hidden">
              
              <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                <h3 className="text-xl font-bold text-cyan-400">
                  {showHistory ? "Scan History" : "Latest Scan Preview"}
                </h3>
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className="bg-gray-700 text-white px-3 py-1 text-sm rounded hover:bg-gray-600 transition"
                >
                  {showHistory ? "Back to Preview" : `View History (${scannedHistory.length})`}
                </button>
              </div>
              
              {!showHistory ? (
                /* DETAILED LATEST SCAN PREVIEW */
                <div className="flex-1 overflow-y-auto pr-2">
                  {lastScannedOrder ? (
                    <div className="bg-gray-800 p-4 rounded-lg border border-cyan-400 flex flex-col h-full">
                      <div className="animate-pulse mb-4">
                        <p className="text-3xl font-bold text-white mb-2">{lastScannedOrder.colB}</p>
                        <p className="text-xl text-cyan-200 font-semibold mb-1">{lastScannedOrder.cells[3]?.value || "No Name"}</p>
                        <p className="text-gray-300 font-mono mb-2">{cleanPhoneNumber(lastScannedOrder.cells[4]?.value || "")}</p>
                        <p className="text-gray-400 text-sm whitespace-pre-wrap leading-relaxed">{lastScannedOrder.cells[5]?.value || "No Address Provided"}</p>
                      </div>

                      <div className="mb-4 bg-gray-900 p-3 rounded">
                        <p className="font-bold text-gray-400 text-xs uppercase mb-2 border-b border-gray-700 pb-1">Products</p>
                        {extractProducts(lastScannedOrder.cells).length === 0 ? (
                           <p className="text-sm italic text-gray-500">No products found</p>
                        ) : (
                          extractProducts(lastScannedOrder.cells).map((p, i) => (
                            <div key={i} className="flex justify-between text-sm text-gray-200 mb-1">
                              <span className="w-4/5 break-words">{p.name}</span>
                              <span className="w-1/5 text-right font-bold text-cyan-400">x{p.qty}</span>
                            </div>
                          ))
                        )}
                      </div>

                      {lastScannedOrder.colC && (
                        <div className="mb-4 p-3 bg-gray-700 rounded border border-gray-600">
                          <p className="text-xs text-gray-400 uppercase font-bold mb-1">Note / Special Instructions:</p>
                          <p className="text-sm text-white break-words">{lastScannedOrder.colC}</p>
                        </div>
                      )}

                      <div className="mt-auto p-3 bg-gray-900 rounded border-l-4 border-green-500 text-sm text-gray-300 flex items-center gap-2">
                        <span className="text-green-500 font-bold text-lg">✓</span> 
                        <span>Successfully marked Cyan in Google Sheets</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500 italic text-center">
                      Waiting for package scan...
                    </div>
                  )}
                </div>
              ) : (
                /* HISTORY LIST (LAST 10) */
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {scannedHistory.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-500 italic text-center">
                      No scanning history yet.
                    </div>
                  ) : (
                    scannedHistory.map((order, i) => (
                      <div key={i} className={`p-4 rounded border-l-4 ${i === 0 ? 'bg-gray-800 border-cyan-400' : 'bg-gray-800/50 border-gray-500'}`}>
                        <div className="flex justify-between items-start mb-1">
                          <p className={`text-xl font-bold ${i === 0 ? 'text-white' : 'text-gray-300'}`}>{order.colB}</p>
                          {i === 0 && <span className="text-xs bg-cyan-900 text-cyan-200 px-2 py-1 rounded">LATEST</span>}
                        </div>
                        <p className={`text-md font-semibold ${i === 0 ? 'text-cyan-200' : 'text-gray-400'}`}>{order.cells[3]?.value || "No Name"}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* POS PRINTER UI (Optimized for Compact)       */}
      {/* ========================================== */}
      <div className="hidden print:block bg-white text-black font-mono text-[10px] leading-none max-w-[80mm] mx-auto">
        {activeView === "printFilter" && filteredOrders
          .filter(order => selectedForPrint.includes(order.colB)) 
          .map((order, index) => {
          const customerName = order.cells[3]?.value || "No Name Provided";
          const rawPhone = order.cells[4]?.value || "";
          const phone = cleanPhoneNumber(rawPhone);
          const address = order.cells[5]?.value || "";
          const totalAmount = order.cells[10]?.value || "0";
          const products = extractProducts(order.cells);

          return (
            <div 
              key={index} 
              className="flex flex-col py-2 border-b-2 border-dashed border-black mb-1 pb-1" 
              style={{ pageBreakInside: 'avoid' }}
            >
              {/* ========================================== */}
              {/* NEW SIDE-BY-SIDE HEADER                      */}
              {/* ========================================== */}
              <div className="flex justify-between items-start mb-2">
                
                {/* Left Side: Order Info & Customer Details */}
                <div className="flex items-center justify-center gap-2 mb-2 pb-2 border-b-2 border-black">
                  <img src="/logo.webp" alt="Nitto Notun" className="h-8 w-auto object-contain brightness-0" />
                  <h1 className="text-xl font-bold uppercase tracking-widest leading-none">Nitto Notun</h1>
                </div>
                <div className="flex flex-col w-2/3 pr-0">
                  <p className="text-xs font-bold leading-none float-left"><span>{order.colB}</span> <span>{customerName}</span></p>
                  <p className="text-[8px] mb-1.5 mt-0.5">Order date: {formatShortDate(order.colA)}</p>
                  <p className="font-bold leading-tight">{phone}</p>
                  <p className="text-[8px] whitespace-pre-wrap mt-0.5 leading-tight">{address}</p>
                </div>

                {/* Right Side: QR Code */}
                <div className="w-1/3 flex justify-end">
                  {/* Reduced size slightly to 64 so it fits perfectly next to text */}
                  <QRCodeCanvas value={order.colB} size={64} />
                </div>
                
              </div>

              {/* ========================================== */}
              {/* PRODUCTS & TOTAL                             */}
              {/* ========================================== */}
              <div className="mb-0 border-t border-dashed border-black pt-1">
                {products.length === 0 ? (
                   <p className="text-[8px] italic">No items found</p>
                ) : (
                  products.map((item, i) => (
                    <div key={i} className="flex justify-between text-[9px] mb-0">
                      <span className="w-4/5 pr-1 break-words">{item.name}</span>
                      <span className="w-1/5 text-right font-bold">x{item.qty}</span>
                    </div>
                  ))
                )}
              </div>

              {order.colC && (
                <p className="text-[8px] font-bold mb-0 pb-0">Note: {order.colC}</p>
              )}

              <div className="flex justify-between font-bold text-sm border-t border-black py-0">
                <span>Total:</span>
                <span>৳{totalAmount}</span>
              </div>

              {/* ========================================== */}
              {/* BRANDING FOOTER                              */}
              {/* ========================================== */}
              <div className="flex flex-col items-center justify-center mt-0 mb-1 pt-0 pb-1 border-t border-dashed border-gray-400">
                
                <p className="text-[8px] font-bold mt-1 text-center italic">Thanks for ordering at Nitto Notun.</p>
                <p className="text-[7px] text-center mt-0.5">nittonotun.shop | +880 13062 86385</p>
              </div>
              
              
            </div>
          );
        })}
      </div>
    </>
  );
}