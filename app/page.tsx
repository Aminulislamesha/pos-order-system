"use client";

import React, { useEffect, useState, useRef } from "react";
import { QRCodeCanvas } from 'qrcode.react'; 
import { Html5QrcodeScanner } from 'html5-qrcode';
import ReadyToPackageView from './ReadyToPackageView';

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
  isoDate: string; // Tracks YYYY-MM-DD
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
  const [activeView, setActiveView] = useState<"main" | "printFilter" | "scanner" | "factoryReport" | "readyToPackage">("main");
  
  // Toggle for Scanner History & Visuals
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [lastScannedOrder, setLastScannedOrder] = useState<OrderRow | null>(null);
  const [scanFlash, setScanFlash] = useState<boolean>(false);

  // ==========================================
  // REAL-TIME MEMORY REFS (Fixes Camera Stale State)
  // ==========================================
  const scannedIdsRef = useRef<string[]>([]);
  const lastScannedOrderRef = useRef<OrderRow | null>(null);
  const allOrdersRef = useRef<OrderRow[]>([]);

  useEffect(() => {
    scannedIdsRef.current = scannedIds;
    lastScannedOrderRef.current = lastScannedOrder;
    allOrdersRef.current = allOrders;
  }, [scannedIds, lastScannedOrder, allOrders]);

  // Factory Spreadsheet, Drag Selection & Hierarchy Removal State
  const [reportSearch, setReportSearch] = useState<string>(""); 
  const [activeFactoryFilters, setActiveFactoryFilters] = useState<string[]>([]);
  const [activeFactoryInclusions, setActiveFactoryInclusions] = useState<string[]>([]);
  const [selectedFactoryDates, setSelectedFactoryDates] = useState<string[]>([]);
  const [factoryData, setFactoryData] = useState<{availableFilters: string[], orders: any[], factoryList: any[]}>({availableFilters: [], orders: [], factoryList: []});
  const [factoryLoading, setFactoryLoading] = useState(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedFactoryRows, setSelectedFactoryRows] = useState<number[]>([]);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [removedNodes, setRemovedNodes] = useState<string[]>([]); 

  // DOM Refs for Auto-Scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mousePosRef = useRef<{x: number, y: number} | null>(null);

  // Utility functions
  const cleanPhoneNumber = (phoneStr: string) => phoneStr ? phoneStr.replace(/^`/, '').trim() : "";
  
  const extractProducts = (cells: CellData[]) => {
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

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (activeView === "factoryReport") {
      setFactoryLoading(true);
      fetch(`/api/inventory/factory-shortages?filters=${activeFactoryFilters.join(',')}&dates=${selectedFactoryDates.join(',')}&inclusions=${activeFactoryInclusions.join(',')}`)
        .then(res => res.json())
        .then(json => {
          if (json.success) setFactoryData(json.data);
          setFactoryLoading(false);
        })
        .catch(err => {
          console.error(err);
          setFactoryLoading(false);
        });
    }
  }, [activeView, activeFactoryFilters, selectedFactoryDates, activeFactoryInclusions]);

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

  // FIXED: Auto-strips time so timezones don't accidentally push orders into tomorrow
  const getISODate = (serial: string | number) => {
    if (!serial) return "";
    const numericSerial = Number(serial);
    
    if (isNaN(numericSerial)) {
      const dateObj = new Date(String(serial));
      if (isNaN(dateObj.getTime())) return "";
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } else {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      // Math.floor forces it to drop the fraction (time of day) and look ONLY at the date
      const dateObj = new Date(excelEpoch.getTime() + Math.floor(numericSerial) * 86400000);
      const year = dateObj.getUTCFullYear();
      const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  };

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/orders");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const ordersWithDates = json.data.map((row: any) => ({
        ...row,
        formattedDate: formatGoogleDate(row.colA),
        isoDate: getISODate(row.colA)
      }));

      setAllOrders(ordersWithDates);
      setScannedIds([]); 
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // PRINT FILTER & URGENT DISPATCH LOGIC
  // ==========================================
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
        
        const noteItems = notes.split(',').map(item => item.trim().toLowerCase());
        const hasRequiredCode = noteItems.includes('c') || noteItems.includes('m') || noteItems.includes('wa');
        
        const hasUrgentDispatch = /(?:vu|d|dispatch\s*)\d+/i.test(notes);
        const isExchange = /exchange|exc/i.test(notes) || /exc/i.test(orderId);
        
        return isNotExcluded && (hasRequiredCode || hasUrgentDispatch || isExchange);
      }
      return false; 
    });

    const getDispatchDay = (note: string | null): number | null => {
      if (!note) return null;
      const matches = [...note.matchAll(/(?:vu|d|dispatch\s*)(\d+)/ig)];
      if (matches.length > 0) {
        const days = matches.map(m => parseInt(m[1], 10));
        return Math.min(...days);
      }
      return null;
    };

    const sorted = filtered.sort((a, b) => {
      const dayA = getDispatchDay(a.colC);
      const dayB = getDispatchDay(b.colC);

      if (dayA !== null && dayB !== null) {
        if (dayA !== dayB) return dayA - dayB;
      }
      if (dayA !== null && dayB === null) return -1;
      if (dayA === null && dayB !== null) return 1;

      const getTime = (serial: string | number) => {
        if (!serial) return 0;
        const num = Number(serial);
        if (isNaN(num)) return isNaN(new Date(String(serial)).getTime()) ? 0 : new Date(String(serial)).getTime();
        return new Date(Date.UTC(1899, 11, 30)).getTime() + num * 86400000;
      };
      return getTime(a.colA) - getTime(b.colA); 
    });

    setFilteredOrders(sorted);
    setSelectedForPrint(sorted.map(r => r.colB)); 
    setLastSelectedIndex(null); 
    setActiveView("printFilter");
  };

  // ==========================================
  // FACTORY DATA CALCULATION (Filter + Date + Sort)
  // ==========================================
  const consolidatedFactoryList = React.useMemo(() => {
    const parsedList = factoryData.factoryList.map((item: any) => {
       let splitIndex = item.name.lastIndexOf(' / ');
       let baseName = item.name;
       let size = "N/A";
       if (splitIndex !== -1) {
         baseName = item.name.substring(0, splitIndex).trim();
         size = item.name.substring(splitIndex + 3).trim();
       } else {
         // Fallback: try splitting by comma if no slash exists (e.g. "Color: Navy Blue, XXL")
         const commaSplitIndex = item.name.lastIndexOf(',');
         if (commaSplitIndex !== -1) {
           baseName = item.name.substring(0, commaSplitIndex).trim();
           size = item.name.substring(commaSplitIndex + 1).trim();
         }
       }

       let product = baseName;
       let color = "";
       const colorSplitIndex = baseName.lastIndexOf(' - ');
       if (colorSplitIndex !== -1) {
          product = baseName.substring(0, colorSplitIndex).trim();
          color = baseName.substring(colorSplitIndex + 3).trim();
       }

       return { name: item.name, baseName, product, color, size, qty: item.requiredQty };
    });
    // Only needed for replacement alignment, keeping original lines removed.

    const searchTerms = reportSearch.toLowerCase().split(" ").filter(Boolean);
    const filtered = parsedList.filter(item => {
      if (removedNodes.includes(`P:${item.product}`)) return false;
      if (removedNodes.includes(`C:${item.product}|${item.color}`)) return false;
      if (removedNodes.includes(`S:${item.name}`)) return false;
      return searchTerms.every(term => item.name.toLowerCase().includes(term));
    });

    const productTotals: Record<string, number> = {};
    const groupTotals: Record<string, number> = {};
    filtered.forEach(item => {
      productTotals[item.product] = (productTotals[item.product] || 0) + item.qty;
      groupTotals[item.baseName] = (groupTotals[item.baseName] || 0) + item.qty;
    });

    const sizeWeights: Record<string, number> = { "3XL": 1, "2XL": 2, "XL": 3, "L": 4, "M": 5, "S": 6, "KID": 7 };
    const getWeight = (s: string) => sizeWeights[s.toUpperCase()] || 99;

    return filtered.sort((a, b) => {
      if (productTotals[b.product] !== productTotals[a.product]) return productTotals[b.product] - productTotals[a.product];
      if (a.product !== b.product) return a.product.localeCompare(b.product);
      if (a.color !== b.color) return a.color.localeCompare(b.color);
      return getWeight(a.size) - getWeight(b.size);
    });
  }, [factoryData, reportSearch, removedNodes]);

  const currentTotalUnits = consolidatedFactoryList.reduce((sum, item) => sum + item.qty, 0);

  // ==========================================
  // EDGE AUTO-SCROLLING ENGINE & LISTENERS
  // ==========================================
  useEffect(() => {
    let animationFrame: number;
    
    const scrollLoop = () => {
        if (isDragging && mousePosRef.current && scrollContainerRef.current) {
            const rect = scrollContainerRef.current.getBoundingClientRect();
            const edgeSize = 60; 
            const maxSpeed = 15;
            let scrollSpeed = 0;

            const { y } = mousePosRef.current;

            if (y > rect.bottom - edgeSize) {
                const intensity = Math.min(1, (y - (rect.bottom - edgeSize)) / edgeSize);
                scrollSpeed = intensity * maxSpeed;
            } else if (y < rect.top + edgeSize) {
                const intensity = Math.min(1, ((rect.top + edgeSize) - y) / edgeSize);
                scrollSpeed = -intensity * maxSpeed;
            }

            if (scrollSpeed !== 0) {
                scrollContainerRef.current.scrollTop += scrollSpeed;
                
                const elem = document.elementFromPoint(mousePosRef.current.x, mousePosRef.current.y);
                const tr = elem?.closest('tr[data-index]');
                if (tr) {
                    const indexStr = tr.getAttribute('data-index');
                    if (indexStr) {
                       const index = parseInt(indexStr, 10);
                       if (!isNaN(index) && dragStartIndex !== null) {
                           setSelectedFactoryRows(prev => {
                              const start = Math.min(dragStartIndex, index);
                              const end = Math.max(dragStartIndex, index);
                              const range = [];
                              for (let i = start; i <= end; i++) range.push(i);
                              if (prev.length === range.length && prev[0] === range[0] && prev[prev.length-1] === range[range.length-1]) return prev; 
                              return range;
                           });
                       }
                    }
                }
            }
        }
        animationFrame = requestAnimationFrame(scrollLoop);
    };

    if (isDragging) animationFrame = requestAnimationFrame(scrollLoop);

    const handleMouseMove = (e: MouseEvent) => {
        mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleCopy = (e: ClipboardEvent) => {
      if (activeView === "factoryReport" && selectedFactoryRows.length > 0) {
        e.preventDefault(); 
        const selectedData = consolidatedFactoryList.filter((_, i) => selectedFactoryRows.includes(i));
        let tsv = "Rank\tProduct Variant Description\tQty to Produce\n";
        selectedData.forEach((row) => {
          const actualRank = consolidatedFactoryList.findIndex(r => r.name === row.name) + 1;
          tsv += `${actualRank}\t${row.name}\t${row.qty}\n`;
        });
        e.clipboardData?.setData('text/plain', tsv);
        alert(`Copied ${selectedData.length} rows to clipboard! Ready to paste into Google Sheets.`);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('copy', handleCopy);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('copy', handleCopy);
      cancelAnimationFrame(animationFrame);
    };
  }, [activeView, isDragging, dragStartIndex, selectedFactoryRows, consolidatedFactoryList]);

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

  // Camera Scanner Effect
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
      } catch (e) {}
      processScannedCode(decodedText.trim());
      setTimeout(() => { try { scanner.resume(); } catch (err) {} }, 1000);
    }, (error) => {});
    return () => { scanner.clear().catch(console.error); };
  }, [activeView]);

  const processScannedCode = (code: string) => {
    // 1. Silent Ignore: If you are holding the EXACT SAME paper from 1 second ago, do nothing.
    if (lastScannedOrderRef.current?.colB === code) {
      return; 
    }

    // 2. Alert: If you scan a package you already completed earlier today
    if (scannedIdsRef.current.includes(code)) {
      alert(`⚠️ ALREADY SCANNED: ${code} has already been scanned in this session.`);
      return; 
    }

    // 3. Alert: If the order doesn't exist in memory at all (Ghost Package)
    const orderExists = allOrdersRef.current.find(o => o.colB === code);
    if (!orderExists) {
      alert(`❌ ERROR: Order [${code}] not found in the system!\n\nPlease click "Force Refresh Data". If it still fails, check the Google Sheet to ensure the order wasn't deleted or altered.`);
      return; 
    } 

    // 4. Alert: If the order is already marked as cyan in the Google Sheet from a previous session
    const isAlreadyCyan = orderExists.cells.some((c: any) => c.backgroundColor === 'rgb(0, 255, 255)' || c.isCyan);
    if (isAlreadyCyan) {
      alert(`⚠️ ALREADY PACKAGED: Order [${code}] was already marked as packaged (cyan) in the Google Sheet.`);
      return;
    }
    
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
      body: JSON.stringify({ 
        action: "color", 
        rowIndex: orderExists.originalRowIndex,
        orderId: code // <-- NEW: Sending the actual Order ID to fix the shifting row bug!
      })
    }).catch(err => console.error("Failed to update Sheet color:", err));
    /* Use this code if you want to alert on backend errors, but it will slow down the scanning process 
    // Fire and forget background fetch, but listen for backend errors
    fetch("/api/scanner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "color", 
        rowIndex: orderExists.originalRowIndex,
        orderId: code 
      })
    })
    .then(async (res) => {
      const data = await res.json();
      if (!data.success) {
        // This alerts you if the row shifted and couldn't be found!
        alert(`❌ GOOGLE SHEETS ERROR: Could not color row cyan.\n\nReason: ${data.error}`);
      }
    })
    .catch(err => console.error("Network failed to connect to server:", err));
    */
  };

  const markAsPrinted = async () => {
    const rowsToProcess = filteredOrders.filter(r => selectedForPrint.includes(r.colB));
    if (rowsToProcess.length === 0) return alert("Please select at least one order to mark as printed.");
    if (!confirm(`Mark ${rowsToProcess.length} selected orders with a strikethrough in Google Sheets?`)) return;
    setIsLoading(true);
    try {
      const indices = rowsToProcess.map(r => r.originalRowIndex);
      await fetch("/api/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "strikethrough", rowIndices: indices }) });
      
      // Update local state without waiting for a full re-fetch so the UI is snappy and we stay on the same screen
      setFilteredOrders(prev => prev.filter(r => !selectedForPrint.includes(r.colB)));
      setSelectedForPrint([]);
      
      // We still fetch orders in the background to sync the master list
      fetchOrders(); 
    } catch (err) {
      alert("Error updating rows.");
      setIsLoading(false);
    }
  };

  const copyCyanRows = () => {
    const cyanRows = allOrders.filter(row => scannedIds.includes(row.colB) || row.cells.some(c => c.backgroundColor === 'rgb(0, 255, 255)'));
    if (cyanRows.length === 0) return alert("No scanned/cyan rows to copy.");
    const textData = cyanRows.map(r => r.cells.map(c => c.value).join("\t")).join("\n");
    navigator.clipboard.writeText(textData);
    alert(`Copied ${cyanRows.length} cyan rows to clipboard!`);
  };

  const removeCyanRows = async () => {
    const cyanRows = allOrders.filter(row => scannedIds.includes(row.colB) || row.cells.some(c => c.backgroundColor === 'rgb(0, 255, 255)'));
    if (cyanRows.length === 0) return alert("No scanned/cyan rows to delete.");
    if (!confirm(`Permanently delete ${cyanRows.length} cyan rows from Google Sheets?`)) return;
    setIsLoading(true);
    try {
      const indices = cyanRows.map(r => r.originalRowIndex);
      await fetch("/api/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", rowIndices: indices }) });
      await fetchOrders();
    } catch (err) {
      alert("Error deleting cyan rows.");
      setIsLoading(false);
    }
  };

  if (error) return <div className="p-10 text-red-500 font-bold">Error: {error}</div>;

  return (
    <>
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 z-[100] flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="animate-spin text-6xl mb-4">⚙️</div>
          <div className="text-xl font-bold text-gray-800">Syncing with Google Sheets...</div>
        </div>
      )}
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
                <button onClick={() => setActiveView("scanner")} className="bg-purple-600 text-white px-6 py-2 rounded-md font-bold hover:bg-purple-700 shadow-md">📷 Start Scanning</button>
                <button onClick={openFilteredView} className="bg-blue-600 text-white px-6 py-2 rounded-md font-bold hover:bg-blue-700 shadow-md">🖨️ Open Ready to Print</button>
                <button onClick={() => setActiveView("factoryReport")} className="bg-orange-600 text-white px-6 py-2 rounded-md font-bold hover:bg-orange-700 shadow-md">🏭 Factory Report</button>
                <button onClick={() => window.location.href = '/inventory'} className="bg-teal-600 text-white px-6 py-2 rounded-md font-bold hover:bg-teal-700 shadow-md">🗄️ Inventory Dashboard</button>
                <button onClick={() => setActiveView("readyToPackage")} className="bg-green-600 text-white px-6 py-2 rounded-md font-bold hover:bg-green-700 shadow-md">📦 Ready to Package</button>
                <button onClick={fetchOrders} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md font-semibold hover:bg-gray-300 transition shadow-sm">Force Refresh Data</button>
              </div>
            </div>

            <div className="flex gap-4 mb-6 bg-cyan-50 p-4 border border-cyan-200 rounded-lg">
              <span className="font-bold text-cyan-800 flex items-center">Cyan Row Actions:</span>
              <button onClick={copyCyanRows} className="bg-cyan-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-cyan-700 shadow-sm">Copy All Cyan Rows</button>
              <button onClick={removeCyanRows} className="bg-red-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-red-700 shadow-sm">Delete All Cyan Rows from Sheet</button>
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
                <button onClick={() => window.print()} disabled={selectedForPrint.length === 0} className="bg-green-500 text-white px-6 py-3 rounded-md font-bold hover:bg-green-600 shadow-md text-lg disabled:bg-gray-500">🖨️ Print Selected</button>
                <button onClick={markAsPrinted} disabled={selectedForPrint.length === 0} className="bg-red-500 text-white px-6 py-3 rounded-md font-bold hover:bg-red-600 shadow-md text-lg disabled:bg-gray-500">✏️ Mark as Printed</button>
                <button onClick={() => setActiveView("main")} className="bg-gray-300 text-gray-800 px-6 py-3 rounded-md font-bold hover:bg-gray-400 shadow-md">Close X</button>
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
                                  if (isChecking) setSelectedForPrint(prev => Array.from(new Set([...prev, ...rowsInRange])));
                                  else setSelectedForPrint(prev => prev.filter(id => !rowsInRange.includes(id)));
                                } else {
                                  if (isSelected) setSelectedForPrint(prev => prev.filter(id => id !== row.colB));
                                  else setSelectedForPrint(prev => [...prev, row.colB]);
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
          <div className="flex justify-between items-center bg-gray-900 p-3 shrink-0 shadow-md z-10">
            <h2 className="text-xl md:text-2xl font-bold text-white">📷 Scanner</h2>
            <button onClick={() => setActiveView("main")} className="bg-red-600 text-white px-4 py-1.5 md:px-6 md:py-2 rounded-md font-bold hover:bg-red-700 shadow-md text-sm md:text-base">Close</button>
          </div>
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
            <div className={`relative h-[40%] md:h-auto md:flex-1 bg-gray-800 flex flex-col items-center justify-center p-1 md:p-4 border-b-4 md:border-b-0 md:border-r-4 transition-colors duration-200 ${scanFlash ? 'border-green-500 bg-green-900/30' : 'border-gray-700'}`}>
               <div id="reader" className="w-full h-full max-w-lg bg-black rounded-lg overflow-hidden flex items-center justify-center [&>video]:object-cover"></div>
               <p className="text-gray-400 mt-2 text-xs text-center hidden md:block">Use your camera or upload an image. Leave this screen open as long as you need to scan.</p>
            </div>
            <div className={`h-[60%] md:h-auto w-full md:w-1/3 bg-gray-900 border-t-4 md:border-t-0 md:border-l-4 p-3 md:p-6 flex flex-col overflow-hidden transition-all duration-200 ${scanFlash ? 'border-green-500 shadow-[0px_0px_30px_rgba(34,197,94,0.25)_inset]' : 'border-cyan-500'}`}>
              <div className="flex justify-between items-center mb-2 md:mb-4 border-b border-gray-700 pb-2 shrink-0">
                <h3 className="text-lg md:text-xl font-bold text-cyan-400">{showHistory ? "Scan History" : "Latest Scan"}</h3>
                <button onClick={() => setShowHistory(!showHistory)} className="bg-gray-700 text-white px-3 py-1 text-xs md:text-sm rounded hover:bg-gray-600 transition">
                  {showHistory ? "Back to Preview" : `History (${scannedHistory.length})`}
                </button>
              </div>
              {!showHistory ? (
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
                                if (isFlag) return <span key={i} className="inline-block bg-red-600 text-white px-2 py-0.5 rounded font-black uppercase tracking-wider shadow-[0_0_10px_rgba(220,38,38,0.8)] border border-red-400 animate-pulse mx-1">{part}</span>;
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
                    <div className="h-full flex items-center justify-center text-gray-500 italic text-sm text-center">Waiting for package scan...</div>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {scannedHistory.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-500 italic text-sm text-center">No scanning history yet.</div>
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
      {/* VIEW 4: FACTORY PRODUCTION REPORT SPREADSHEET */}
      {/* NOTE: 'print:hidden' completely removes this screen from the paper! */}
      {/* ========================================== */}
      {activeView === "factoryReport" && (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans print:hidden select-none">
          <div className="max-w-5xl mx-auto bg-white rounded-lg shadow-lg border border-gray-300 flex flex-col h-[85vh]">
            
            <div className="bg-white border-b border-gray-300 p-4 shrink-0">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-600 text-white p-2 rounded shadow-sm">📊</div>
                  <h2 className="text-xl font-bold text-gray-800">Factory Production Sheet</h2>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="bg-gray-100 border border-gray-300 text-gray-700 px-4 py-1.5 rounded hover:bg-gray-200 text-sm font-semibold transition">
                    🖨️ Print {selectedFactoryRows.length > 0 ? "Selected" : "All"}
                  </button>
                  <button onClick={() => { setSelectedFactoryRows([]); setActiveView("main"); }} className="bg-red-50 text-red-600 border border-red-200 px-4 py-1.5 rounded hover:bg-red-100 text-sm font-semibold transition">
                    Close Sheet
                  </button>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-2">
                
                {/* MULTI-DATE FILTER CHIPS & PICKER */}
                <div className="flex flex-wrap items-center bg-white border border-gray-300 rounded-md p-1 shadow-sm w-full md:w-auto min-h-[40px]">
                  <span className="text-gray-400 text-lg mx-2">📅</span>
                  
                  {selectedFactoryDates.map(date => (
                    <span key={date} className="flex items-center bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded mr-2 mb-1 mt-1">
                      {date}
                      <button 
                        onClick={() => {
                          setSelectedFactoryDates(prev => prev.filter(d => d !== date));
                          setSelectedFactoryRows([]);
                        }}
                        className="ml-1 text-blue-500 hover:text-blue-700 focus:outline-none"
                        title="Remove date"
                      >✕</button>
                    </span>
                  ))}

                  <input 
                    type="date"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && !selectedFactoryDates.includes(val)) {
                        setSelectedFactoryDates(prev => [...prev, val].sort());
                        setSelectedFactoryRows([]);
                        setRemovedNodes([]);
                      }
                    }}
                    className="outline-none text-sm font-semibold text-gray-700 bg-transparent cursor-pointer ml-1 mb-1 mt-1"
                    title="Add Date"
                  />
                  
                  {selectedFactoryDates.length > 0 && (
                    <button 
                      onClick={() => { setSelectedFactoryDates([]); setSelectedFactoryRows([]); setRemovedNodes([]); }} 
                      className="ml-auto mr-2 text-xs text-red-500 hover:text-red-700 font-bold"
                    >Clear</button>
                  )}
                </div>

                {/* TAG FILTER CHIPS & PICKER */}
                <div className="flex flex-wrap items-center bg-white border border-gray-300 rounded-md p-1 shadow-sm w-full md:w-auto min-h-[40px]">
                  <span className="text-gray-400 text-lg mx-2">🏷️</span>
                  
                  {activeFactoryFilters.map(filter => (
                    <span key={filter} className="flex items-center bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded mr-2 mb-1 mt-1">
                      {filter}
                      <button 
                        onClick={() => {
                          setActiveFactoryFilters(prev => prev.filter(f => f !== filter));
                          setSelectedFactoryRows([]);
                        }}
                        className="ml-1 text-blue-500 hover:text-blue-700 focus:outline-none"
                        title="Remove filter"
                      >✕</button>
                    </span>
                  ))}

                  <select 
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && !activeFactoryFilters.includes(val)) {
                        setActiveFactoryFilters(prev => [...prev, val].sort());
                        setSelectedFactoryRows([]);
                        setRemovedNodes([]);
                      }
                    }}
                    className="outline-none text-sm font-semibold text-gray-700 bg-transparent cursor-pointer ml-1 mb-1 mt-1"
                    title="Add Tag Filter"
                  >
                    <option value="" disabled>+ Add Filter</option>
                    {factoryData.availableFilters.filter(f => !activeFactoryFilters.includes(f)).map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  
                  {activeFactoryFilters.length > 0 && (
                    <button 
                      onClick={() => { setActiveFactoryFilters([]); setSelectedFactoryRows([]); setRemovedNodes([]); }} 
                      className="text-red-400 hover:text-red-600 text-xs font-bold px-2 ml-auto"
                      title="Clear All Filters"
                    >Clear</button>
                  )}
                </div>

                {/* THROWAWAY INCLUSION PICKER */}
                <div className="flex flex-wrap items-center bg-white border border-gray-300 rounded-md p-1 shadow-sm w-full md:w-auto min-h-[40px]">
                  <span className="text-gray-400 text-lg mx-2">🗑️</span>
                  
                  {activeFactoryInclusions.map(inc => (
                    <span key={inc} className="flex items-center bg-gray-200 text-gray-800 text-xs font-bold px-2 py-1 rounded mr-2 mb-1 mt-1">
                      {inc}
                      <button 
                        onClick={() => {
                          setActiveFactoryInclusions(prev => prev.filter(i => i !== inc));
                          setSelectedFactoryRows([]);
                        }}
                        className="ml-1 text-gray-500 hover:text-gray-700 focus:outline-none"
                        title="Remove inclusion"
                      >✕</button>
                    </span>
                  ))}

                  <select 
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && !activeFactoryInclusions.includes(val)) {
                        setActiveFactoryInclusions(prev => [...prev, val].sort());
                        setSelectedFactoryRows([]);
                        setRemovedNodes([]);
                      }
                    }}
                    className="outline-none text-sm font-semibold text-gray-700 bg-transparent cursor-pointer ml-1 mb-1 mt-1"
                    title="Include Throwaways"
                  >
                    <option value="" disabled>+ Include Orders</option>
                    {['Cancelled', 'Hold', 'See Message', 'Unreachable', 'See WA', 'Number Off', 'See Whatsapp', 'Strikethrough', 'Cyan']
                      .filter(f => !activeFactoryInclusions.includes(f.toLowerCase()))
                      .map(f => (
                      <option key={f} value={f.toLowerCase()}>{f}</option>
                    ))}
                  </select>
                  
                  {activeFactoryInclusions.length > 0 && (
                    <button 
                      onClick={() => { setActiveFactoryInclusions([]); setSelectedFactoryRows([]); setRemovedNodes([]); }} 
                      className="text-red-400 hover:text-red-600 text-xs font-bold px-2 ml-auto"
                      title="Clear All Inclusions"
                    >Clear</button>
                  )}
                </div>

                <div className="flex-1 flex items-center bg-white border border-gray-300 rounded-md overflow-hidden shadow-sm h-10 w-full">
                  <span className="px-3 text-gray-400">fx</span>
                  <input 
                    type="text" 
                    placeholder="Filter variants (e.g. 'snuggly black')..." 
                    value={reportSearch}
                    onChange={(e) => {
                      setReportSearch(e.target.value);
                      setSelectedFactoryRows([]);
                      setRemovedNodes([]); 
                    }}
                    className="w-full p-2 outline-none text-sm font-mono h-full"
                  />
                </div>

                {removedNodes.length > 0 && (
                   <button 
                      onClick={() => setRemovedNodes([])} 
                      className="text-xs bg-gray-200 text-gray-700 px-3 py-2 rounded hover:bg-gray-300 transition shrink-0 font-bold h-10"
                   >
                      ↺ Restore {removedNodes.length} removed
                   </button>
                )}
              </div>
              
              {selectedFactoryRows.length > 0 && (
                <p className="text-xs text-blue-600 font-semibold mt-2">
                  {selectedFactoryRows.length} rows selected. Press Ctrl+C to copy to Sheets, or Ctrl+P to print.
                </p>
              )}
            </div>

            <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-gray-100 flex flex-col justify-between relative">
              <table className="w-full text-left border-collapse bg-white cursor-cell">
                <thead className="sticky top-0 z-20 shadow-sm">
                  <tr>
                    <th className="w-12 bg-gray-100 border border-gray-300 p-2 text-center text-gray-400"></th>
                    <th className="bg-gray-100 border border-gray-300 p-1.5 text-center text-xs font-semibold text-gray-600 select-none w-24">A (Rank)</th>
                    <th className="bg-gray-100 border border-gray-300 p-1.5 text-center text-xs font-semibold text-gray-600 select-none">B (Product Variant)</th>
                    <th className="bg-gray-100 border border-gray-300 p-1.5 text-center text-xs font-semibold text-gray-600 select-none w-32">C (Quantity)</th>
                  </tr>
                </thead>
                <tbody>
                  {factoryLoading ? (
                    <tr>
                      <td colSpan={4} className="p-10 border border-gray-300">
                        <div className="flex flex-col items-center justify-center gap-3 py-4">
                          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-gray-500 font-semibold animate-pulse">Fetching factory data...</span>
                        </div>
                      </td>
                    </tr>
                  ) : consolidatedFactoryList.length === 0 ? (
                    <tr><td colSpan={4} className="p-10 text-center text-gray-400 italic border border-gray-300">No data found for this selection.</td></tr>
                  ) : (
                    (() => {
                      let currentProduct = "";
                      let currentColor = "";

                      return consolidatedFactoryList.map((item, index) => {
                        const isSelected = selectedFactoryRows.includes(index);
                        const isSearching = reportSearch.trim() !== "";

                        const showProductHeader = isSearching && item.product !== currentProduct;
                        const showColorHeader = isSearching && (item.product !== currentProduct || item.color !== currentColor);

                        if (isSearching) {
                            currentProduct = item.product;
                            currentColor = item.color;
                        }
                        
                        return (
                          <React.Fragment key={index}>
                            {showProductHeader && (
                              <tr className="bg-gray-800 text-white">
                                <td colSpan={4} className="p-0">
                                  <div className="flex justify-between items-center px-4 py-2 group">
                                    <span className="font-bold text-base uppercase tracking-wider">{item.product}</span>
                                    <button 
                                      onClick={() => setRemovedNodes(prev => [...prev, `P:${item.product}`])} 
                                      className="text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none"
                                      title={`Remove all ${item.product}`}
                                    >✕</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {showColorHeader && item.color && (
                              <tr className="bg-gray-200 text-gray-800 border-b border-gray-300">
                                <td colSpan={4} className="p-0">
                                  <div className="flex justify-between items-center pl-8 pr-4 py-1.5 group">
                                    <span className="font-bold text-sm text-gray-700">🎨 {item.color}</span>
                                    <button 
                                      onClick={() => setRemovedNodes(prev => [...prev, `C:${item.product}|${item.color}`])} 
                                      className="text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-base leading-none"
                                      title={`Remove ${item.color} color`}
                                    >✕</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr 
                              data-index={index}
                              className={`${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'} transition-colors`}
                              onMouseDown={() => { setIsDragging(true); setDragStartIndex(index); setSelectedFactoryRows([index]); }}
                              onMouseEnter={() => {
                                if (isDragging && dragStartIndex !== null) {
                                  const start = Math.min(dragStartIndex, index);
                                  const end = Math.max(dragStartIndex, index);
                                  const range = [];
                                  for (let i = start; i <= end; i++) range.push(i);
                                  setSelectedFactoryRows(range);
                                }
                              }}
                            >
                              <td className={`border border-gray-300 text-center text-xs text-gray-500 ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}>
                                {index + 1}
                              </td>
                              <td className={`border border-gray-300 p-2 text-center text-sm text-gray-800 ${isSelected ? 'border-blue-300 text-blue-900' : ''}`}>
                                {isSearching ? "" : index + 1}
                              </td>
                              <td className={`border border-gray-300 p-2 text-sm text-gray-800 ${isSelected ? 'border-blue-300 text-blue-900' : ''}`}>
                                {isSearching ? <span className="pl-10 font-mono text-gray-500">↳ {item.size}</span> : item.name}
                              </td>
                              <td className={`border border-gray-300 p-2 pr-8 text-right text-sm font-medium text-gray-800 relative group ${isSelected ? 'border-blue-300 text-blue-900' : ''}`}>
                                {item.qty}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setRemovedNodes(prev => [...prev, `S:${item.name}`]); setSelectedFactoryRows([]); }} 
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center bg-white rounded shadow border border-gray-200"
                                  title={`Remove ${item.size}`}
                                >✕</button>
                              </td>
                            </tr>
                          </React.Fragment>
                        )
                      })
                    })()
                  )}
                </tbody>
                <tfoot className="bg-orange-100 border-t-4 border-orange-400 sticky bottom-0 z-30 shadow-md">
                  <tr>
                    <td colSpan={3} className="p-3 text-right font-black text-orange-900 uppercase tracking-wider">
                      Total Units:
                    </td>
                    <td className="p-3 pr-8 text-right font-black text-xl text-orange-900">
                      {currentTotalUnits}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED ORDERS TABLE FOR FACTORY REPORT */}
      {activeView === "factoryReport" && factoryData?.orders && factoryData.orders.length > 0 && (
        <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg border border-gray-300 mt-8 mb-16 overflow-hidden print:hidden">
          <div className="bg-gray-800 text-white p-4">
            <h2 className="text-xl font-bold">Detailed Orders Breakdown</h2>
            <p className="text-gray-400 text-sm">Showing the exact orders that contribute to the factory shortages above.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="p-3 border-r border-gray-200">Date</th>
                  <th className="p-3 border-r border-gray-200">Order ID</th>
                  <th className="p-3 border-r border-gray-200">Note</th>
                  <th className="p-3 border-r border-gray-200">Name</th>
                  <th className="p-3 border-r border-gray-200">Phone</th>
                  <th className="p-3 border-r border-gray-200 min-w-[150px]">Address</th>
                  <th className="p-3 border-r border-gray-200">Product(s)</th>
                  <th className="p-3 text-center">Qty</th>
                </tr>
              </thead>
              <tbody>
                {factoryData.orders.map((order: any, idx: number) => (
                  <tr key={idx} className="border-b border-gray-300 hover:bg-blue-100 transition-colors">
                    <td className="p-3 border-r border-gray-300 whitespace-nowrap text-gray-900 font-semibold text-base">{order.colA}</td>
                    <td className="p-3 border-r border-gray-300 whitespace-nowrap font-bold text-blue-800 text-base">{order.colB}</td>
                    <td className="p-3 border-r border-gray-300 text-sm text-red-700 font-bold">{order.colC}</td>
                    <td className="p-3 border-r border-gray-300 text-gray-900 font-bold text-base">{order.colD}</td>
                    <td className="p-3 border-r border-gray-300 whitespace-nowrap text-gray-900 font-bold text-base">{order.colE}</td>
                    <td className="p-3 border-r border-gray-300 text-sm text-gray-900 font-medium leading-tight">{order.colF}</td>
                    <td className="p-0 border-r border-gray-300 align-top">
                      {order.orderProducts.map((p: any, i: number) => (
                        <div key={i} className={`p-2 px-3 text-gray-900 font-bold text-base ${i !== order.orderProducts.length - 1 ? 'border-b border-gray-300' : ''}`}>
                          {p.rawName}
                        </div>
                      ))}
                    </td>
                    <td className="p-0 align-top text-center font-bold text-gray-900 text-base">
                      {order.orderProducts.map((p: any, i: number) => (
                        <div key={i} className={`p-2 px-3 ${i !== order.orderProducts.length - 1 ? 'border-b border-gray-300' : ''}`}>
                          {p.qty}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* EXCLUSIVE POS PRINTER UI (80mm Receipt layout) */}
      {/* ========================================== */}
      <div className="hidden print:block bg-white text-black font-mono text-[10px] leading-none max-w-[80mm] break-words mx-auto pb-4">
        
        {/* 1. ORDER RECEIPTS UI */}
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
            <div key={index} className="flex flex-col py-0.5 border-b-2 border-dashed border-black mb-0.5 pb-0.5" style={{ pageBreakInside: 'avoid' }}>
              <div className="flex items-center justify-center gap-2 mb-0.5 pb-0.5 border-b-2 border-black">
                <img src="/logo2.png" alt="Nitto Notun" className="h-6 w-auto object-contain brightness-0" />
                <h3 className="text-sm font-bold uppercase tracking-widest leading-none">Nitto Notun</h3>
              </div>
              <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col w-2/3 pr-0">
                  <p className="text-[13px] font-bold leading-none float-left">ID: {order.colB}</p>
                  <p className="text-[11px] font-bold leading-none float-left">{customerName}</p>
                  <p className="text-[10px] mb-1.5 mt-0.5">Date: {formatShortDate(order.colA)}</p>
                  <p className="font-bold leading-tight">{phone}</p>
                  <p className="text-[8px] whitespace-pre-wrap mt-0.5 leading-tight">{address}</p>
                </div>
                <div className="w-1/3 flex justify-end pr-2">
                  <QRCodeCanvas value={order.colB} size={64} />
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
              {order.colC && (
                <p className="text-[9px] font-bold mb-0 pb-0 pt-0.5 break-words whitespace-pre-wrap">Note: {order.colC}</p>
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


        {/* 2. FACTORY REPORT RECEIPT UI */}
        {activeView === "factoryReport" && (
          <div className="flex flex-col pb-2 px-2">
            <div className="flex flex-col items-center justify-center mb-3 pb-2 border-b-2 border-black">
              <h2 className="text-base font-bold uppercase tracking-widest leading-tight text-center">Factory Report</h2>
              <p className="text-[10px] mt-1 font-bold">
                {new Date().toLocaleDateString('en-GB')}
                {activeFactoryFilters.length > 0 && ` | Filters: ${activeFactoryFilters.join(', ')}`}
              </p>
            </div>
            
            <div className="mb-2">
              {(() => {
                const dataToPrint = selectedFactoryRows.length > 0 
                  ? consolidatedFactoryList.filter((_, i) => selectedFactoryRows.includes(i))
                  : consolidatedFactoryList;
                
                if(dataToPrint.length === 0) return <p className="text-[10px] text-center italic">No data selected</p>;

                let currentProduct = "";
                let currentColor = "";

                return dataToPrint.map((item, i) => {
                  const showProductHeader = item.product !== currentProduct;
                  const showColorHeader = item.product !== currentProduct || item.color !== currentColor;

                  if (showProductHeader) currentProduct = item.product;
                  if (showColorHeader) currentColor = item.color;

                  return (
                    <React.Fragment key={i}>
                      
                      {/* PRINT PRODUCT HEADER */}
                      {showProductHeader && (
                        <div className="mt-3 mb-1 border-b border-black pb-0.5" style={{ pageBreakInside: 'avoid' }}>
                          <span className="font-black text-[13px] uppercase tracking-wider">{item.product}</span>
                        </div>
                      )}
                      
                      {/* PRINT COLOR HEADER */}
                      {showColorHeader && item.color && (
                        <div className="mt-1 mb-0.5 ml-1" style={{ pageBreakInside: 'avoid' }}>
                          <span className="font-bold text-[12px] italic">Color: {item.color}</span>
                        </div>
                      )}

                      {/* PRINT SIZES (Indented) */}
                      <div className="flex justify-between items-start border-b border-dashed border-gray-300 py-1 mb-0.5 ml-3" style={{ pageBreakInside: 'avoid' }}>
                        <div className="flex flex-col w-4/5 pr-1">
                          <span className="font-semibold text-[12px] leading-tight">Size: {item.size}</span>
                        </div>
                        <div className="w-1/5 text-right font-black text-[13px]">
                          {item.qty} {item.qty > 1 ? 'pcs' : 'pc'}
                        </div>
                      </div>

                    </React.Fragment>
                  );
                });
              })()}
            </div>
            
            <div className="flex justify-between font-bold text-sm border-t-2 border-black pt-2 mt-2">
              <span>Total Units:</span>
              <span>
                {(() => {
                  const dataToPrint = selectedFactoryRows.length > 0 
                  ? consolidatedFactoryList.filter((_, i) => selectedFactoryRows.includes(i))
                  : consolidatedFactoryList;
                  return dataToPrint.reduce((sum, item) => sum + item.qty, 0);
                })()}
              </span>
            </div>
            <div className="mt-4 text-center text-[8px] italic">End of Report</div>
          </div>
        )}
      </div>

      {/* Ready To Package View */}
      {activeView === "readyToPackage" && (
        <ReadyToPackageView onBack={() => setActiveView("main")} />
      )}
    </>
  );
}
