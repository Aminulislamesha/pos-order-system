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
  
  // Toggle for Scanner History & Visuals
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [lastScannedOrder, setLastScannedOrder] = useState<OrderRow | null>(null);
  const [scanFlash, setScanFlash] = useState<boolean>(false);

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
        
        // Split by comma for strict standalone character checks
        const noteItems = notes.split(',').map(item => item.trim().toLowerCase());
        const hasRequiredCode = noteItems.includes('c') || noteItems.includes('m') || noteItems.includes('wa');
        
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

  // Camera Scanner Effect (HIGH SPEED)
  useEffect(() => {
    if (activeView !== "scanner") return;
    const scanner = new Html5QrcodeScanner("reader", { qrbox: { width: 250, height: 250 }, fps: 5 }, false);
    
    scanner.render((decodedText) => {
      try { scanner.pause(true); } catch (err) {}

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

      processScannedCode(decodedText.trim());

      setTimeout(() => {
        try { scanner.resume(); } catch (err) {}
      }, 1000);
      
    }, (error) => {});
    
    return () => { scanner.clear().catch(console.error); };
  }, [activeView]);

  // HIGH SPEED SCAN PROCESSOR
  const processScannedCode = (code: string) => {
    const orderExists = allOrders.find(o => o.colB === code);
    if (!orderExists) return; 
    
    if (scannedIds.includes(code)) return; 
    
    // Trigger visual success flash
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 500);
    
    // Update local UI
    setScannedIds(prev => [...prev, code]);
    setLastScannedOrder(orderExists);
    setScannedHistory(prev => [orderExists, ...prev].slice(0, 10));
    setShowHistory(false);
    
    // Fire and forget background fetch
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
      {/* VIEW 3: CAMERA SCANNER MODAL (LOCKED HUD)  */}
      {/* ========================================== */}
      {activeView === "scanner" && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col print:hidden overflow-hidden">
          
          {/* COMPACT HEADER */}
          <div className="flex justify-between items-center bg-gray-900 p-3 shrink-0 shadow-md z-10">
            <h2 className="text-xl md:text-2xl font-bold text-white">📷 Scanner</h2>
            <button onClick={() => setActiveView("main")} className="bg-red-600 text-white px-4 py-1.5 md:px-6 md:py-2 rounded-md font-bold hover:bg-red-700 shadow-md text-sm md:text-base">
              Close
            </button>
          </div>
          
          {/* SPLIT SCREEN LAYOUT (No Scrolling) */}
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
            
            {/* TOP (MOBILE) / LEFT (DESKTOP): CAMERA VIEWFINDER */}
            <div className={`relative h-[45%] md:h-auto md:flex-1 bg-gray-800 flex flex-col items-center justify-center p-1 md:p-4 border-b-4 md:border-b-0 md:border-r-4 transition-colors duration-200 ${scanFlash ? 'border-green-500 bg-green-900/30' : 'border-gray-700'}`}>
               <div id="reader" className="w-full h-full max-w-lg bg-black rounded-lg overflow-hidden flex items-center justify-center [&>video]:object-cover"></div>
               <p className="text-gray-400 mt-2 text-xs text-center hidden md:block">Use your camera or upload an image. Leave this screen open as long as you need to scan.</p>
            </div>
            
            {/* BOTTOM (MOBILE) / RIGHT (DESKTOP): ACTION HUD */}
            <div className={`h-[55%] md:h-auto w-full md:w-1/3 bg-gray-900 border-t-4 md:border-t-0 md:border-l-4 p-3 md:p-6 flex flex-col overflow-hidden transition-all duration-200 ${scanFlash ? 'border-green-500 shadow-[0px_0px_30px_rgba(34,197,94,0.25)_inset]' : 'border-cyan-500'}`}>
              
              <div className="flex justify-between items-center mb-2 md:mb-4 border-b border-gray-700 pb-2 shrink-0">
                <h3 className="text-lg md:text-xl font-bold text-cyan-400">
                  {showHistory ? "Scan History" : "Latest Scan"}
                </h3>
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className="bg-gray-700 text-white px-3 py-1 text-xs md:text-sm rounded hover:bg-gray-600 transition"
                >
                  {showHistory ? "Back to Preview" : `History (${scannedHistory.length})`}
                </button>
              </div>
              
              {!showHistory ? (
                /* DETAILED LATEST SCAN PREVIEW (Internally Scrollable) */
                <div className="flex-1 overflow-y-auto pr-2">
                  {lastScannedOrder ? (
                    <div className="bg-gray-800 p-3 md:p-4 rounded-lg border border-cyan-400 flex flex-col min-h-full">
                      <div className="mb-3">
                        <p className="text-2xl md:text-3xl font-bold text-white mb-1">{lastScannedOrder.colB}</p>
                        <p className="text-lg md:text-xl text-cyan-200 font-semibold leading-tight mb-1">{lastScannedOrder.cells[3]?.value || "No Name"}</p>
                        <p className="text-gray-300 font-mono text-sm md:text-base mb-1">{cleanPhoneNumber(lastScannedOrder.cells[4]?.value || "")}</p>
                        <p className="text-gray-400 text-xs md:text-sm whitespace-pre-wrap leading-tight">{lastScannedOrder.cells[5]?.value || "No Address"}</p>
                      </div>

                      <div className="mb-3 bg-gray-900 p-2 md:p-3 rounded">
                        <p className="font-bold text-gray-400 text-[10px] md:text-xs uppercase mb-1 border-b border-gray-700 pb-1">Products</p>
                        {extractProducts(lastScannedOrder.cells).length === 0 ? (
                           <p className="text-xs italic text-gray-500">No products found</p>
                        ) : (
                          extractProducts(lastScannedOrder.cells).map((p, i) => (
                            <div key={i} className="flex justify-between text-xs md:text-sm text-gray-200 mb-1">
                              <span className="w-4/5 break-words pr-1">{p.name}</span>
                              <span className="w-1/5 text-right font-bold text-cyan-400">x{p.qty}</span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* RED FLAG WARNING SYSTEM FOR NOTES */}
                      {lastScannedOrder.colC && (
                        <div className={`mb-3 p-2 md:p-3 rounded border transition-colors ${/(hold|cancelled|cancel|see message|see wa|call before dispatch)/i.test(lastScannedOrder.colC) ? 'bg-red-950/60 border-red-500' : 'bg-gray-700 border-gray-600'}`}>
                          <p className={`text-[10px] md:text-xs uppercase font-bold mb-1.5 ${/(hold|cancelled|cancel|see message|see wa|call before dispatch)/i.test(lastScannedOrder.colC) ? 'text-red-400' : 'text-gray-400'}`}>
                            {/(hold|cancelled|cancel|see message|see wa|call before dispatch)/i.test(lastScannedOrder.colC) ? '⚠️ WARNING / NOTE:' : 'Note:'}
                          </p>
                          <p className="text-xs md:text-sm text-white break-words leading-relaxed items-center">
                            {(() => {
                              const noteText = lastScannedOrder.colC;
                              const flagRegex = /(hold|cancelled|cancel|see message|see wa|call before dispatch)/gi;
                              const parts = noteText.split(flagRegex);
                              
                              return parts.map((part, i) => {
                                const isFlag = /^(hold|cancelled|cancel|see message|see wa|call before dispatch)$/i.test(part);
                                if (isFlag) {
                                  return (
                                    <span key={i} className="inline-block bg-red-600 text-white px-2 py-0.5 rounded font-black uppercase tracking-wider shadow-[0_0_10px_rgba(220,38,38,0.8)] border border-red-400 animate-pulse mx-1">
                                      {part}
                                    </span>
                                  );
                                }
                                return <span key={i}>{part}</span>;
                              });
                            })()}
                          </p>
                        </div>
                      )}

                      <div className="mt-auto p-2 bg-gray-900 rounded border-l-4 border-green-500 text-xs text-gray-300 flex items-center gap-2">
                        <span className="text-green-500 font-bold text-sm">✓</span> 
                        <span>Marked Cyan in Google Sheets</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500 italic text-sm text-center">
                      Waiting for package scan...
                    </div>
                  )}
                </div>
              ) : (
                /* HISTORY LIST (Internally Scrollable) */
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {scannedHistory.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-500 italic text-sm text-center">
                      No scanning history yet.
                    </div>
                  ) : (
                    scannedHistory.map((order, i) => (
                      <div key={i} className={`p-3 rounded border-l-4 ${i === 0 ? 'bg-gray-800 border-cyan-400' : 'bg-gray-800/50 border-gray-500'}`}>
                        <div className="flex justify-between items-start mb-1">
                          <p className={`text-lg font-bold ${i === 0 ? 'text-white' : 'text-gray-300'}`}>{order.colB}</p>
                          {i === 0 && <span className="text-[10px] bg-cyan-900 text-cyan-200 px-1.5 py-0.5 rounded">LATEST</span>}
                        </div>
                        <p className={`text-sm font-semibold truncate ${i === 0 ? 'text-cyan-200' : 'text-gray-400'}`}>{order.cells[3]?.value || "No Name"}</p>
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
          const rawName = String(order.cells[3]?.value || "No Name Provided").trim();
          const customerName = rawName.split(/\s+/).slice(0, 2).join(" ");
          const rawPhone = order.cells[4]?.value || "";
          const phone = cleanPhoneNumber(rawPhone);
          const address = order.cells[5]?.value || "";
          const totalAmount = order.cells[10]?.value || "0";
          const products = extractProducts(order.cells);

          return (
            <div 
              key={index} 
              className="flex flex-col py-0.5 border-b-2 border-dashed border-black mb-0.5 pb-0.5" 
              style={{ pageBreakInside: 'avoid' }}
            >
              {/* ========================================== */}
              {/* 1. TOP LOGO HEADER (Full Width)              */}
              {/* ========================================== */}
              <div className="flex items-center justify-center gap-2 mb-0.5 pb-0.5 border-b-2 border-black">
                <img src="/logo2.png" alt="Nitto Notun" className="h-6 w-auto object-contain brightness-0" />
                <h3 className="text-sm font-bold uppercase tracking-widest leading-none">Nitto Notun</h3>
              </div>

              {/* ========================================== */}
              {/* 2. SIDE-BY-SIDE INFO & QR CODE               */}
              {/* ========================================== */}
              <div className="flex justify-between items-start mb-2">
                
                {/* Left Side: Order Info & Customer Details */}
                <div className="flex flex-col w-2/3 pr-0">
                  <p className="text-[11px] font-bold leading-none float-left">Order ID: {order.colB}</p>
                  <p className="text-[11px] font-bold leading-none float-left">{customerName}</p>
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