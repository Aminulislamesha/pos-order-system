"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";

interface ProductItem {
  name: string;
  orderedQty: number;
  packedQty: number;
}

interface PartialPackageRecord {
  id: string;
  serialNumber: number | null;
  previousSerial: number | null;
  orderId: string;
  rowIndex: number;
  date: string | null;
  note: string | null;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  rawProducts: { name: string; orderedQty: number }[];
  packedProducts: { name: string; packedQty: number }[];
  isFulfilled: boolean;
  fulfilledAt: string | null;
  sheetColor: string | null;
  rawCells: any[] | null;
  createdAt: string;
  updatedAt: string;
}

const NOTE_WARNING_REGEX = /\b(cancelled|cancel|hold|see message|see m|see whatsapp|see wa|pos update need|pos update needed)\b/i;

export default function PartialPackagingPage() {
  // Data state
  const [partialPackages, setPartialPackages] = useState<PartialPackageRecord[]>([]);
  const [sheetOrders, setSheetOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Scanner & Modal state
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [manualOrderId, setManualOrderId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [modalProducts, setModalProducts] = useState<ProductItem[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Shortage View & Filter state
  const [showShortagesView, setShowShortagesView] = useState<boolean>(false);
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState<boolean>(false);

  const scannerRef = useRef<any>(null);

  // Show temporary toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Fetch partial packages from database
  const fetchPartialPackages = async (syncWithSheet = false) => {
    try {
      if (syncWithSheet) setIsSyncing(true);
      const res = await fetch(`/api/partial${syncWithSheet ? '?sync=true' : ''}`, {
        cache: 'no-store'
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setPartialPackages(json.data);
        if (syncWithSheet) showToast("Synced with Google Sheet successfully!");
      } else {
        console.error("Failed to load partial packages:", json.error);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  // 2. Fetch sheet orders for lookup
  const fetchSheetOrders = async () => {
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSheetOrders(json.data);
      }
    } catch (err) {
      console.error("Error loading sheet orders:", err);
    }
  };

  useEffect(() => {
    fetchPartialPackages();
    fetchSheetOrders();
  }, []);

  // Initialize html5-qrcode scanner when modal opens
  useEffect(() => {
    let html5QrcodeScanner: any = null;

    if (scannerOpen) {
      const loadScanner = async () => {
        try {
          const { Html5QrcodeScanner } = await import('html5-qrcode');
          html5QrcodeScanner = new Html5QrcodeScanner(
            "partial-qr-reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            false
          );

          html5QrcodeScanner.render(
            (decodedText: string) => {
              handleScannedCode(decodedText);
              html5QrcodeScanner.clear().catch((e: any) => console.error(e));
              setScannerOpen(false);
            },
            (err: any) => {
              // Ignore frame read failures
            }
          );
          scannerRef.current = html5QrcodeScanner;
        } catch (err) {
          console.error("Scanner init error:", err);
        }
      };
      loadScanner();
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((e: any) => console.error(e));
        scannerRef.current = null;
      }
    };
  }, [scannerOpen]);

  // Extract products from sheet row cells
  const extractProductsFromCells = (cells: any[]) => {
    const products: { name: string; orderedQty: number }[] = [];
    if (!cells || !Array.isArray(cells)) return products;
    for (let i = 11; i < cells.length; i += 2) {
      const name = cells[i]?.value;
      const qty = cells[i + 1]?.value;
      if (name && String(name).trim() !== "" && name !== "NaN") {
        products.push({
          name: String(name).trim(),
          orderedQty: parseInt(String(qty || "1"), 10) || 1
        });
      }
    }
    return products;
  };

  // Open packaging modal for an order (either from scan or table edit)
  const openPackagingModalForOrder = (orderId: string, sheetOrderFallback?: any) => {
    const cleanId = String(orderId).trim();
    const existingPkg = partialPackages.find(p => p.orderId.toLowerCase() === cleanId.toLowerCase());
    const sheetOrder = sheetOrderFallback || sheetOrders.find(o => String(o.colB).trim().toLowerCase() === cleanId.toLowerCase());

    if (!existingPkg && !sheetOrder) {
      alert(`❌ Order [${cleanId}] not found in the Google Sheet data. Please click "Sync with Sheet" or check the Order ID.`);
      return;
    }

    // Determine raw products
    let rawProducts: { name: string; orderedQty: number }[] = [];
    if (existingPkg && Array.isArray(existingPkg.rawProducts) && existingPkg.rawProducts.length > 0) {
      rawProducts = existingPkg.rawProducts;
    } else if (sheetOrder && sheetOrder.cells) {
      rawProducts = extractProductsFromCells(sheetOrder.cells);
    }

    // Determine packed items
    const packedMap = new Map<string, number>();
    if (existingPkg && Array.isArray(existingPkg.packedProducts)) {
      existingPkg.packedProducts.forEach(p => packedMap.set(String(p.name).trim().toLowerCase(), Number(p.packedQty) || 0));
    }

    const items: ProductItem[] = rawProducts.map(rp => ({
      name: rp.name,
      orderedQty: rp.orderedQty,
      packedQty: packedMap.get(rp.name.trim().toLowerCase()) || 0
    }));

    const orderContext = existingPkg ? {
      orderId: existingPkg.orderId,
      colA: existingPkg.date,
      colB: existingPkg.orderId,
      colC: existingPkg.note,
      colD: existingPkg.customerName,
      colE: existingPkg.phone,
      colF: existingPkg.address,
      cells: existingPkg.rawCells,
      rowIndex: existingPkg.rowIndex,
      serialNumber: existingPkg.serialNumber,
      isFulfilled: existingPkg.isFulfilled
    } : {
      orderId: sheetOrder.colB,
      colA: sheetOrder.colA,
      colB: sheetOrder.colB,
      colC: sheetOrder.colC,
      colD: sheetOrder.cells?.[3]?.value || "",
      colE: sheetOrder.cells?.[4]?.value || "",
      colF: sheetOrder.cells?.[5]?.value || "",
      cells: sheetOrder.cells,
      rowIndex: sheetOrder.originalRowIndex,
      serialNumber: null,
      isFulfilled: false
    };

    setEditingOrder(orderContext);
    setModalProducts(items);
    setModalOpen(true);
  };

  // Handle scanned code
  const handleScannedCode = (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    openPackagingModalForOrder(clean);
  };

  // Save changes from modal
  const handleSaveModal = async (forceFulfilled = false) => {
    if (!editingOrder) return;
    setIsSaving(true);

    try {
      const rawProducts = modalProducts.map(p => ({
        name: p.name,
        orderedQty: p.orderedQty
      }));

      const packedProducts = modalProducts.map(p => ({
        name: p.name,
        packedQty: forceFulfilled ? p.orderedQty : p.packedQty
      }));

      // Check if all packed
      const allPacked = modalProducts.length > 0 && modalProducts.every(p => {
        return (forceFulfilled ? p.orderedQty : p.packedQty) >= p.orderedQty;
      });

      const isFulfilled = forceFulfilled || allPacked;

      const payload = {
        orderId: editingOrder.orderId,
        packedProducts,
        rawProducts,
        isFulfilled,
        orderData: {
          rowIndex: editingOrder.rowIndex,
          colA: editingOrder.colA,
          colB: editingOrder.colB,
          colC: editingOrder.colC,
          colD: editingOrder.colD,
          colE: editingOrder.colE,
          colF: editingOrder.colF,
          cells: editingOrder.cells
        }
      };

      const res = await fetch('/api/partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        showToast(isFulfilled ? `Order ${editingOrder.orderId} marked as Fulfilled!` : `Order ${editingOrder.orderId} saved as Partial!`);
        setModalOpen(false);
        fetchPartialPackages();
      } else {
        alert("Error saving: " + (json.error || "Unknown error"));
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // One-click "Mark as Full" from table
  const handleMarkAsFullDirect = async (pkg: PartialPackageRecord) => {
    if (!confirm(`Mark Order [${pkg.orderId}] as completely fulfilled and color Cyan in Google Sheet?`)) return;

    try {
      const raw = Array.isArray(pkg.rawProducts) ? pkg.rawProducts : [];
      const packed = raw.map(rp => ({ name: rp.name, packedQty: rp.orderedQty }));

      const res = await fetch('/api/partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: pkg.orderId,
          packedProducts: packed,
          rawProducts: raw,
          isFulfilled: true,
          orderData: {
            rowIndex: pkg.rowIndex,
            colA: pkg.date,
            colB: pkg.orderId,
            colC: pkg.note,
            colD: pkg.customerName,
            colE: pkg.phone,
            colF: pkg.address,
            cells: pkg.rawCells
          }
        })
      });

      const json = await res.json();
      if (json.success) {
        showToast(`Order ${pkg.orderId} marked Fulfilled (Cyan)!`);
        fetchPartialPackages();
      } else {
        alert("Error: " + json.error);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Delete a single row
  const handleDeleteRow = async (orderId: string) => {
    if (!confirm(`Delete Order [${orderId}] from the partial package list?`)) return;

    try {
      const res = await fetch(`/api/partial?orderId=${encodeURIComponent(orderId)}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Deleted ${orderId}`);
        fetchPartialPackages();
      } else {
        alert("Error deleting: " + json.error);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Bulk remove all fulfilled rows
  const handleRemoveAllFulfilled = async () => {
    const fulfilledCount = partialPackages.filter(p => p.isFulfilled).length;
    if (fulfilledCount === 0) {
      alert("There are no fulfilled orders to remove.");
      return;
    }

    if (!confirm(`Remove all ${fulfilledCount} fulfilled orders from the partial table?`)) return;

    try {
      const res = await fetch('/api/partial?action=clearFulfilled', {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Removed ${json.count || fulfilledCount} fulfilled orders.`);
        fetchPartialPackages();
      } else {
        alert("Error: " + json.error);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // -------------------------------------------------------------
  // SHORTAGE CALCULATION & FILTERING ENGINE
  // -------------------------------------------------------------

  // Helper for ISO Date
  const getISODate = (serialOrDate: any): string => {
    if (!serialOrDate) return "";
    const numeric = Number(serialOrDate);
    if (isNaN(numeric)) {
      const str = String(serialOrDate);
      const parts = str.match(/(\d+)\/(\d+)\/(\d+)/);
      if (parts) {
        const day = parts[1].padStart(2, '0');
        const month = parts[2].padStart(2, '0');
        const year = parts[3].length === 2 ? '20' + parts[3] : parts[3];
        return `${year}-${month}-${day}`;
      }
      const cleanStr = str.replace(/at\s+/i, '');
      const dateObj = new Date(cleanStr);
      if (isNaN(dateObj.getTime())) return "";
      return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    } else {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + Math.floor(numeric) * 86400000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
  };

  // Helper for checking if VU/D tag is due today or earlier
  const isTagDueTodayOrEarlier = (colC: string, orderDateStr: string, todayDateStr: string): boolean => {
    const tagMatches = [...colC.matchAll(/\b(?:VU|D|dispatch)[-\s]*(\d+)\b/gi)];
    if (tagMatches.length === 0) {
      return /\bVU\b/i.test(colC);
    }
    const [todayY, todayM, todayD] = todayDateStr.split('-').map(Number);
    return tagMatches.some(m => {
      const tagDay = parseInt(m[1], 10);
      if (orderDateStr) {
        const [orderY, orderM, orderD] = orderDateStr.split('-').map(Number);
        if (orderY === todayY && orderM === todayM) {
          return tagDay <= todayD;
        }
        let tagY = orderY;
        let tagM = orderM;
        if (tagDay < orderD) {
          tagM += 1;
          if (tagM > 12) { tagM = 1; tagY += 1; }
        }
        const tagDate = `${tagY}-${String(tagM).padStart(2, '0')}-${String(tagDay).padStart(2, '0')}`;
        return tagDate <= todayDateStr;
      }
      return tagDay <= todayD;
    });
  };

  // Available tags strictly from scanned partial orders
  const availablePartialTags = useMemo(() => {
    const tags = new Set<string>();
    partialPackages.forEach(pkg => {
      const note = String(pkg.note || "");
      const matches = note.match(/\b(VU\d+|D\d+|fast)\b/gi);
      if (matches) {
        matches.forEach(t => tags.add(t.toUpperCase()));
      }
    });
    return Array.from(tags).sort();
  }, [partialPackages]);

  // Filtered active partial packages for shortages
  const filteredPartialOrdersForShortages = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');

    return partialPackages.filter(pkg => {
      // Shortages only apply to unfulfilled packages
      if (pkg.isFulfilled) return false;

      // 1. Tag filter
      if (activeTagFilters.length > 0) {
        const note = String(pkg.note || "").toUpperCase();
        const matchesTag = activeTagFilters.some(f => note.includes(f));
        if (!matchesTag) return false;
      }

      // 2. Date exclusion filter (matches Factory Report)
      if (excludedDates.length > 0) {
        const orderIso = getISODate(pkg.date);
        if (excludedDates.includes(orderIso)) {
          // Excluded date: check VU/D urgent exception
          const colC = String(pkg.note || "");
          const isUrgent = isTagDueTodayOrEarlier(colC, orderIso, todayStr);
          if (!isUrgent) {
            return false; // Excluded!
          }
        }
      }

      return true;
    });
  }, [partialPackages, activeTagFilters, excludedDates]);

  // Calculate aggregated shortages
  const consolidatedShortages = useMemo(() => {
    const shortageMap = new Map<string, number>();

    filteredPartialOrdersForShortages.forEach(pkg => {
      const packedMap = new Map<string, number>();
      if (Array.isArray(pkg.packedProducts)) {
        pkg.packedProducts.forEach(p => packedMap.set(String(p.name).trim().toLowerCase(), Number(p.packedQty) || 0));
      }

      if (Array.isArray(pkg.rawProducts)) {
        pkg.rawProducts.forEach(rp => {
          const ordered = Number(rp.orderedQty) || 1;
          const packed = packedMap.get(String(rp.name).trim().toLowerCase()) || 0;
          const missing = ordered - packed;
          if (missing > 0) {
            const key = rp.name.trim();
            shortageMap.set(key, (shortageMap.get(key) || 0) + missing);
          }
        });
      }
    });

    const list = Array.from(shortageMap.entries()).map(([variantName, shortageQty]) => ({
      variantName,
      shortageQty
    }));

    return list.sort((a, b) => a.variantName.localeCompare(b.variantName));
  }, [filteredPartialOrdersForShortages]);

  const totalShortageUnits = useMemo(() => {
    return consolidatedShortages.reduce((sum, item) => sum + item.shortageQty, 0);
  }, [consolidatedShortages]);

  // Copy Shortages formatted for Google Sheets (TSV)
  const handleCopyShortagesForSheet = () => {
    if (consolidatedShortages.length === 0) {
      alert("No shortages to copy.");
      return;
    }

    let tsv = "SL\tProduct Variant\tShortage Quantity\n";
    consolidatedShortages.forEach((item, index) => {
      tsv += `${index + 1}\t${item.variantName}\t${item.shortageQty}\n`;
    });

    navigator.clipboard.writeText(tsv).then(() => {
      showToast("Copied Shortages Table! You can paste directly into Google Sheets.");
    }).catch(err => {
      console.error(err);
      alert("Failed to copy: " + err.message);
    });
  };

  // Helper to parse VU / D tag and dispatch day for priority ordering
  const parseTagInfo = (note: string | null) => {
    if (!note) return { type: 3, day: Infinity };
    const str = String(note).trim();

    // 1. Check VU first (e.g. VU15, VU 15, VU-15, VU)
    const vuMatch = str.match(/\bvu[-\s]*(\d*)\b/i);
    if (vuMatch) {
      const day = vuMatch[1] ? parseInt(vuMatch[1], 10) : 0;
      return { type: 1, day };
    }

    // 2. Check D or dispatch (e.g. D15, D 15, D-15, dispatch 15)
    const dMatch = str.match(/\b(?:d|dispatch)[-\s]*(\d+)\b/i);
    if (dMatch) {
      const day = parseInt(dMatch[1], 10);
      return { type: 2, day };
    }

    // 3. Other orders
    return { type: 3, day: Infinity };
  };

  // Helper to get chronological timestamp for "oldest orders first"
  const getOrderTimestamp = (dateStr: string | null, fallbackRow: number = 0): number => {
    if (!dateStr) return fallbackRow || 0;
    const num = Number(dateStr);
    if (!isNaN(num) && num > 40000) {
      return new Date(Date.UTC(1899, 11, 30)).getTime() + num * 86400000;
    }
    const str = String(dateStr).trim();
    const parts = str.match(/(\d+)\/(\d+)\/(\d+)/);
    if (parts) {
      const day = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      const year = parts[3].length === 2 ? 2000 + parseInt(parts[3], 10) : parseInt(parts[3], 10);
      return new Date(year, month, day).getTime();
    }
    const cleanStr = str.replace(/at\s+/i, '');
    const d = new Date(cleanStr);
    return isNaN(d.getTime()) ? (fallbackRow || 0) : d.getTime();
  };

  // Sort: VU orders first, then D orders, then oldest orders first
  const sortPartialPackages = (list: PartialPackageRecord[]): PartialPackageRecord[] => {
    return [...list].sort((a, b) => {
      // Active orders before Fulfilled orders
      if (a.isFulfilled !== b.isFulfilled) {
        return a.isFulfilled ? 1 : -1;
      }

      const tagA = parseTagInfo(a.note);
      const tagB = parseTagInfo(b.note);

      // 1. VU orders (type 1) before D orders (type 2) before Other orders (type 3)
      if (tagA.type !== tagB.type) {
        return tagA.type - tagB.type;
      }

      // 2. Within VU or D orders, sort by dispatch day ascending
      if (tagA.day !== tagB.day) {
        return tagA.day - tagB.day;
      }

      // 3. Oldest orders first (smaller timestamp = earlier / older)
      const timeA = getOrderTimestamp(a.date, a.rowIndex);
      const timeB = getOrderTimestamp(b.date, b.rowIndex);
      if (timeA !== timeB) {
        return timeA - timeB;
      }

      return (a.rowIndex || 0) - (b.rowIndex || 0);
    });
  };

  // Filtered & Sorted list for the main table: VU first, then D, then oldest orders first
  const displayedPackages = useMemo(() => {
    let list = partialPackages;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => {
        return (
          p.orderId.toLowerCase().includes(q) ||
          (p.customerName && p.customerName.toLowerCase().includes(q)) ||
          (p.phone && p.phone.includes(q)) ||
          (p.note && p.note.toLowerCase().includes(q)) ||
          (p.serialNumber && String(p.serialNumber).includes(q)) ||
          (p.previousSerial && String(p.previousSerial).includes(q)) ||
          (Array.isArray(p.rawProducts) && p.rawProducts.some(rp => rp.name.toLowerCase().includes(q)))
        );
      });
    }
    return sortPartialPackages(list);
  }, [partialPackages, searchQuery]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-xl font-bold flex items-center gap-2 border border-gray-700 animate-bounce">
          <span>🔔</span> {toastMessage}
        </div>
      )}

      {/* HEADER BAR */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📦</span>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Partial Packaging Center</h1>
              <p className="text-xs text-gray-500 font-medium">Manage incomplete orders, assign poly bag serial numbers, track shortages</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setScannerOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-lg shadow transition flex items-center gap-1.5 text-sm"
            >
              📷 Scan Package
            </button>

            <button
              onClick={() => fetchPartialPackages(true)}
              disabled={isSyncing}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg shadow transition flex items-center gap-1.5 text-sm"
              title="Refresh and sync row indices, notes, and colors with Google Sheet"
            >
              {isSyncing ? "🔄 Syncing..." : "🔄 Sync with Sheet"}
            </button>

            <button
              onClick={() => setShowShortagesView(!showShortagesView)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-lg shadow transition flex items-center gap-1.5 text-sm"
            >
              {showShortagesView ? "📋 Back to Table" : "🖨️ Shortages & Print"}
            </button>

            <button
              onClick={handleRemoveAllFulfilled}
              className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold px-3.5 py-2 rounded-lg shadow-sm transition text-sm"
              title="Remove all completed orders from the visual history"
            >
              🗑️ Clear Fulfilled
            </button>

            <button
              onClick={() => window.location.href = '/'}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3.5 py-2 rounded-lg shadow-sm transition text-sm"
            >
              🏠 Home
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================= */}
      {/* VIEW A: MAIN PARTIAL ORDERS TABLE                         */}
      {/* ========================================================= */}
      {!showShortagesView && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          {/* Top Info & Quick Search */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-[#88f7af] border border-green-500 inline-block"></span>
                <span className="text-xs font-bold text-gray-700">
                  Active Partial: {partialPackages.filter(p => !p.isFulfilled).length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-[#00ffff] border border-cyan-500 inline-block"></span>
                <span className="text-xs font-bold text-cyan-800">
                  Fulfilled History: {partialPackages.filter(p => p.isFulfilled).length}
                </span>
              </div>
            </div>

            {/* Quick manual entry input */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                placeholder="Scan / Type Order ID (e.g. SC53358)..."
                value={manualOrderId}
                onChange={e => setManualOrderId(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && manualOrderId.trim()) {
                    handleScannedCode(manualOrderId);
                    setManualOrderId('');
                  }
                }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-purple-500 w-full md:w-64"
              />
              <button
                onClick={() => {
                  if (manualOrderId.trim()) {
                    handleScannedCode(manualOrderId);
                    setManualOrderId('');
                  }
                }}
                className="bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow"
              >
                Pack
              </button>
            </div>

            {/* Search filter for table */}
            <div className="w-full md:w-64">
              <input
                type="text"
                placeholder="🔍 Search in table..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
          </div>

          {/* MAIN TABLE */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-gray-800 text-white uppercase text-xs tracking-wider">
                  <tr>
                    <th className="p-3 border-r border-gray-700 text-center w-24">Serial #</th>
                    <th className="p-3 border-r border-gray-700 min-w-[220px]">Products & Status</th>
                    <th className="p-3 border-r border-gray-700 text-center whitespace-nowrap">Actions</th>
                    <th className="p-3 border-r border-gray-700">Status / Note (C)</th>
                    <th className="p-3 border-r border-gray-700 whitespace-nowrap">Date (A)</th>
                    <th className="p-3 border-r border-gray-700 whitespace-nowrap">Order ID (B)</th>
                    <th className="p-3 border-r border-gray-700">Customer (D)</th>
                    <th className="p-3 border-r border-gray-700">Phone (E)</th>
                    <th className="p-3 min-w-[140px]">Address (F)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-gray-500 font-semibold animate-pulse">
                        Loading partial orders...
                      </td>
                    </tr>
                  ) : displayedPackages.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-gray-400 italic">
                        {searchQuery ? "No matching partial packages found." : "No partial packages yet. Click 'Scan Package' or enter an Order ID above to begin!"}
                      </td>
                    </tr>
                  ) : (
                    displayedPackages.map((pkg) => {
                      const isFulfilled = pkg.isFulfilled;
                      const hasNoteWarning = pkg.note && NOTE_WARNING_REGEX.test(pkg.note);

                      // Build product summary
                      const packedMap = new Map<string, number>();
                      if (Array.isArray(pkg.packedProducts)) {
                        pkg.packedProducts.forEach(p => packedMap.set(String(p.name).trim().toLowerCase(), Number(p.packedQty) || 0));
                      }

                      const totalOrdered = Array.isArray(pkg.rawProducts)
                        ? pkg.rawProducts.reduce((sum, p) => sum + (Number(p.orderedQty) || 1), 0)
                        : 0;
                      const totalPacked = Array.isArray(pkg.packedProducts)
                        ? pkg.packedProducts.reduce((sum, p) => sum + (Number(p.packedQty) || 0), 0)
                        : 0;

                      return (
                        <tr
                          key={pkg.id}
                          className={`transition-colors ${
                            isFulfilled
                              ? 'bg-[#00ffff]/20 hover:bg-[#00ffff]/30'
                              : 'bg-white hover:bg-green-50/50'
                          }`}
                        >
                          {/* 1. SERIAL NUMBER */}
                          <td className="p-3 border-r border-gray-200 text-center font-bold">
                            {isFulfilled ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-cyan-100 text-cyan-800 border border-cyan-400">
                                ✓ Full {pkg.previousSerial ? `(was #${pkg.previousSerial})` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center font-black text-sm bg-amber-500 text-white w-8 h-8 rounded-full shadow-sm">
                                #{pkg.serialNumber}
                              </span>
                            )}
                          </td>

                          {/* 2. PRODUCTS & STATUS */}
                          <td className="p-3 border-r border-gray-200">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  isFulfilled ? 'bg-cyan-200 text-cyan-900' : 'bg-green-100 text-green-800 border border-green-300'
                                }`}>
                                  {totalPacked}/{totalOrdered} Units Packed
                                </span>
                              </div>
                              {Array.isArray(pkg.rawProducts) && pkg.rawProducts.map((rp, i) => {
                                const packed = packedMap.get(rp.name.trim().toLowerCase()) || 0;
                                const isComplete = packed >= rp.orderedQty;
                                return (
                                  <div key={i} className="text-xs flex items-center justify-between gap-2 border-b border-gray-100 last:border-b-0 py-0.5">
                                    <span className={`truncate ${isComplete ? 'text-gray-500 line-through' : 'font-bold text-gray-900'}`}>
                                      {rp.name}
                                    </span>
                                    <span className="font-mono text-[11px] whitespace-nowrap">
                                      <span className={packed > 0 ? 'text-green-700 font-bold' : 'text-gray-400'}>{packed}</span>
                                      <span className="text-gray-400">/{rp.orderedQty}</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          {/* 3. ACTIONS */}
                          <td className="p-3 border-r border-gray-200 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => openPackagingModalForOrder(pkg.orderId)}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-800 p-1.5 rounded text-xs font-bold border border-gray-300"
                                title="Edit Packed Items"
                              >
                                ✏️ Edit
                              </button>

                              {!isFulfilled && (
                                <button
                                  onClick={() => handleMarkAsFullDirect(pkg)}
                                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1.5 rounded text-xs font-bold shadow"
                                  title="Mark as Full Directly (Cyan)"
                                >
                                  ✅ Mark as Full
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteRow(pkg.orderId)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 p-1.5 rounded text-xs font-bold border border-red-200"
                                title="Delete from Partial Table"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>

                          {/* 4. NOTE / STATUS (Col C) with eye-catching flag */}
                          <td className="p-3 border-r border-gray-200">
                            {pkg.note ? (
                              hasNoteWarning ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-black bg-red-600 text-white shadow animate-pulse">
                                  ⚠️ {pkg.note}
                                </span>
                              ) : (
                                <span className="font-bold text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                  {pkg.note}
                                </span>
                              )
                            ) : (
                              <span className="text-gray-400 italic text-xs">—</span>
                            )}
                          </td>

                          {/* 5. DATE (Col A) */}
                          <td className="p-3 border-r border-gray-200 whitespace-nowrap text-gray-800 font-semibold text-xs">
                            {pkg.date || "—"}
                          </td>

                          {/* 6. ORDER ID (Col B) */}
                          <td className="p-3 border-r border-gray-200 whitespace-nowrap font-black text-base text-blue-800">
                            {pkg.orderId}
                          </td>

                          {/* 7. CUSTOMER NAME (Col D) */}
                          <td className="p-3 border-r border-gray-200 font-semibold text-gray-900 text-sm">
                            {pkg.customerName || "—"}
                          </td>

                          {/* 8. PHONE (Col E) */}
                          <td className="p-3 border-r border-gray-200 font-mono text-xs text-gray-700 whitespace-nowrap">
                            {pkg.phone || "—"}
                          </td>

                          {/* 9. ADDRESS (Col F) */}
                          <td className="p-3 text-xs text-gray-600 max-w-[180px] truncate" title={pkg.address || ""}>
                            {pkg.address || "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* ========================================================= */}
      {/* VIEW B: SHORTAGES & PRINTING SECTION                      */}
      {/* ========================================================= */}
      {showShortagesView && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            {/* Top Toolbar */}
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6 pb-4 border-b border-gray-200">
              <div>
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <span>📉</span> Partial Shortages & Production Needs
                </h2>
                <p className="text-xs text-gray-500 font-medium">Items preventing active partial packages from being fulfilled</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCopyShortagesForSheet}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg shadow transition flex items-center gap-1.5 text-sm"
                  title="Copy as TSV ready to paste directly into Google Sheets"
                >
                  📋 Copy for Sheet
                </button>

                <button
                  onClick={() => window.print()}
                  className="bg-gray-800 hover:bg-black text-white font-bold px-4 py-2 rounded-lg shadow transition flex items-center gap-1.5 text-sm"
                >
                  🖨️ Print Shortage List
                </button>
              </div>
            </div>

            {/* FILTERS BAR: Calendar Exclusion & Scanned Tags */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-200">
              {/* Date Exclusion Picker */}
              <div className="flex flex-wrap items-center bg-white border border-gray-300 rounded-md p-1 shadow-sm min-h-[38px]">
                <span className="text-gray-400 text-sm mx-1.5" title="Exclude Dates">📅</span>

                {excludedDates.map(date => (
                  <span key={date} className="flex items-center bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold px-2 py-0.5 rounded mr-1.5 my-0.5">
                    Exclude: {date}
                    <button
                      onClick={() => setExcludedDates(prev => prev.filter(d => d !== date))}
                      className="ml-1 text-rose-400 hover:text-rose-700 font-bold"
                    >
                      ✕
                    </button>
                  </span>
                ))}

                <input
                  type="date"
                  onChange={e => {
                    const val = e.target.value;
                    if (val && !excludedDates.includes(val)) {
                      setExcludedDates(prev => [...prev, val].sort());
                    }
                    setTimeout(() => { if (e.target) e.target.value = ''; }, 0);
                  }}
                  className="outline-none text-xs font-semibold text-gray-700 bg-transparent cursor-pointer ml-1"
                  title="Pick Date to Exclude"
                />

                {excludedDates.length > 0 && (
                  <button
                    onClick={() => setExcludedDates([])}
                    className="ml-auto mr-1.5 text-xs text-red-500 hover:text-red-700 font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Tag Filters (strictly from scanned partial orders) */}
              <div className="relative">
                <div className="flex flex-wrap items-center bg-white border border-gray-300 rounded-md p-1 shadow-sm min-h-[38px]">
                  <span className="text-gray-400 text-sm mx-1.5">🏷️</span>

                  {activeTagFilters.map(tag => (
                    <span key={tag} className="flex items-center bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded mr-1.5 my-0.5">
                      {tag}
                      <button
                        onClick={() => setActiveTagFilters(prev => prev.filter(t => t !== tag))}
                        className="ml-1 text-blue-500 hover:text-blue-700 font-bold"
                      >
                        ✕
                      </button>
                    </span>
                  ))}

                  <button
                    onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                    className="text-xs font-bold text-gray-700 hover:text-blue-600 px-2 py-1 flex items-center gap-1"
                  >
                    + Add Filter ▾
                  </button>

                  {activeTagFilters.length > 0 && (
                    <button
                      onClick={() => setActiveTagFilters([])}
                      className="ml-1 text-xs text-red-500 hover:text-red-700 font-bold mr-1"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Dropdown Options */}
                {isTagDropdownOpen && (
                  <div className="absolute left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 max-h-56 overflow-y-auto">
                    {availablePartialTags.length === 0 ? (
                      <div className="p-3 text-xs text-gray-400 italic text-center">
                        No tags found in partial orders
                      </div>
                    ) : (
                      availablePartialTags
                        .filter(t => !activeTagFilters.includes(t))
                        .map(tag => (
                          <button
                            key={tag}
                            onClick={() => {
                              setActiveTagFilters(prev => [...prev, tag]);
                              setIsTagDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs font-bold text-gray-800 hover:bg-blue-50 hover:text-blue-700"
                          >
                            {tag}
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Consolidated Shortages Table */}
            <div className="overflow-hidden border border-gray-300 rounded-lg">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-gray-100 text-gray-800 text-xs uppercase font-bold border-b border-gray-300">
                  <tr>
                    <th className="p-3 border-r border-gray-300 text-center w-16">SL</th>
                    <th className="p-3 border-r border-gray-300">B (Product Variant)</th>
                    <th className="p-3 text-center w-36">C (Shortage Qty)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {consolidatedShortages.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-gray-400 italic">
                        No shortages! All items in active packages are packed or no orders match current filters.
                      </td>
                    </tr>
                  ) : (
                    consolidatedShortages.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 border-r border-gray-200 text-center font-bold text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="p-3 border-r border-gray-200 font-bold text-gray-900">
                          {item.variantName}
                        </td>
                        <td className="p-3 text-center font-black text-red-600 text-base">
                          {item.shortageQty}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {consolidatedShortages.length > 0 && (
                  <tfoot className="bg-amber-50 font-black text-gray-900 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={2} className="p-3 text-right uppercase tracking-wider">
                        Total Shortage Units:
                      </td>
                      <td className="p-3 text-center text-xl text-red-700 font-black">
                        {totalShortageUnits}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </main>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: QR CODE SCANNER MODAL                            */}
      {/* ========================================================= */}
      {scannerOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200">
            <div className="bg-purple-700 text-white p-4 flex justify-between items-center">
              <h3 className="font-black text-lg flex items-center gap-2">
                <span>📷</span> Scan Order QR Code
              </h3>
              <button
                onClick={() => setScannerOpen(false)}
                className="text-white hover:text-gray-200 font-bold text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              <p className="text-xs text-gray-500 mb-3 text-center">
                Point your camera at the POS QR code on the order bag or paper.
              </p>
              <div id="partial-qr-reader" className="w-full"></div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setScannerOpen(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold px-4 py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: PACK PRODUCTS MODAL (WITH DYNAMIC QTY INPUT)     */}
      {/* ========================================================= */}
      {modalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
            {/* Header */}
            <div className="bg-gray-900 text-white p-5 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-black text-2xl text-blue-400">{editingOrder.orderId}</h3>
                  {editingOrder.serialNumber && !editingOrder.isFulfilled && (
                    <span className="bg-amber-500 text-white font-black text-xs px-2.5 py-1 rounded-full">
                      Bag #{editingOrder.serialNumber}
                    </span>
                  )}
                  {editingOrder.isFulfilled && (
                    <span className="bg-cyan-500 text-gray-900 font-black text-xs px-2.5 py-1 rounded-full">
                      ✓ Fulfilled
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 mt-1 font-semibold">{editingOrder.colD || "No Name"} • {editingOrder.colE || "No Phone"}</p>
                <p className="text-xs text-gray-400 truncate max-w-md">{editingOrder.colF || "No Address"}</p>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white font-bold text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Note Warning Banner if sensitive keywords found */}
            {editingOrder.colC && (
              <div className={`p-3 text-xs font-bold border-b flex items-center gap-2 ${
                NOTE_WARNING_REGEX.test(editingOrder.colC)
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-yellow-50 text-yellow-900 border-yellow-200'
              }`}>
                <span>⚠️ Note:</span>
                <span>{editingOrder.colC}</span>
              </div>
            )}

            {/* Products Selection List */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-black uppercase text-gray-700 tracking-wider">
                  Select Packed Products
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setModalProducts(prev => prev.map(p => ({ ...p, packedQty: p.orderedQty })));
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => {
                      setModalProducts(prev => prev.map(p => ({ ...p, packedQty: 0 })));
                    }}
                    className="text-xs font-bold text-red-600 hover:text-red-800"
                  >
                    Unselect All
                  </button>
                </div>
              </div>

              {modalProducts.length === 0 ? (
                <div className="p-8 text-center text-gray-400 italic">
                  No products parsed for this order in Google Sheets.
                </div>
              ) : (
                <div className="space-y-3">
                  {modalProducts.map((p, index) => {
                    const isFullyPacked = p.packedQty >= p.orderedQty;
                    const isPartiallyPacked = p.packedQty > 0 && p.packedQty < p.orderedQty;

                    return (
                      <div
                        key={index}
                        className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between gap-4 ${
                          isFullyPacked
                            ? 'bg-green-50 border-green-300'
                            : isPartiallyPacked
                            ? 'bg-yellow-50 border-yellow-300'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        {/* Checkbox & Product Name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={p.packedQty > 0}
                            onChange={e => {
                              const checked = e.target.checked;
                              setModalProducts(prev => {
                                const next = [...prev];
                                next[index] = {
                                  ...next[index],
                                  packedQty: checked ? next[index].orderedQty : 0
                                };
                                return next;
                              });
                            }}
                            className="w-5 h-5 text-green-600 rounded border-gray-300 cursor-pointer focus:ring-green-500"
                          />

                          <div className="min-w-0">
                            <p className="font-bold text-sm text-gray-900 truncate">{p.name}</p>
                            <p className="text-xs text-gray-500 font-semibold">Ordered: {p.orderedQty} units</p>
                          </div>
                        </div>

                        {/* Quantity Control: If ordered > 1, show numeric input field */}
                        <div className="flex items-center gap-2 shrink-0">
                          {p.orderedQty > 1 ? (
                            <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-lg p-1 shadow-sm">
                              <span className="text-xs text-gray-500 font-bold px-1">Packed:</span>
                              <input
                                type="number"
                                min={0}
                                max={p.orderedQty}
                                value={p.packedQty}
                                onChange={e => {
                                  const val = Math.max(0, Math.min(p.orderedQty, parseInt(e.target.value, 10) || 0));
                                  setModalProducts(prev => {
                                    const next = [...prev];
                                    next[index] = { ...next[index], packedQty: val };
                                    return next;
                                  });
                                }}
                                className="w-14 text-center font-bold text-sm outline-none border-b border-gray-300 focus:border-green-600"
                              />
                              <span className="text-xs text-gray-400 font-bold">/ {p.orderedQty}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-gray-500 px-2">
                              {p.packedQty === 1 ? '✓ 1 Packed' : '0 Packed'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Informative Hint */}
              <p className="text-xs text-gray-500 mt-4 italic bg-blue-50 border border-blue-200 p-2.5 rounded-lg">
                💡 Tip: If no products have arrived yet, you can leave all items unchecked (0 packed) and click <strong>"Save Partial"</strong> to register the bag serial number.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-gray-100 border-t border-gray-200 flex flex-wrap justify-between items-center gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold px-4 py-2 rounded-lg text-sm transition"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSaveModal(false)}
                  disabled={isSaving}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-lg text-sm shadow transition"
                >
                  {isSaving ? "Saving..." : "💾 Save Partial (#88f7af)"}
                </button>

                <button
                  onClick={() => handleSaveModal(true)}
                  disabled={isSaving}
                  className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-lg text-sm shadow transition"
                  title="Marks all products as packed and colors Cyan in Google Sheet"
                >
                  {isSaving ? "Saving..." : "✅ Mark as Full (Cyan)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
