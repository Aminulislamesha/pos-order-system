"use client";

import * as React from "react";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  Plus,
  Database,
  Sparkles,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cleanPhoneNumber, parseDateToYMD } from "@/lib/weblog/utils";

export interface ProductItem {
  product: string;
  quantity: string | number;
}

export interface GridRow {
  id: string;
  date: string;
  invoice_id: string;
  note: string;
  name: string;
  phone: string;
  addr1: string;
  addr2: string;
  col1: string;
  col2: string;
  col3: string;
  total_bill: string | number;
  items: ProductItem[];
}

const CHUNK_SIZE = 200;

const createDefaultRow = (id: string): GridRow => ({
  id,
  date: new Date().toISOString().split("T")[0],
  invoice_id: "",
  note: "",
  name: "",
  phone: "",
  addr1: "",
  addr2: "",
  col1: "",
  col2: "",
  col3: "",
  total_bill: "",
  items: [
    { product: "", quantity: "" },
    { product: "", quantity: "" },
    { product: "", quantity: "" },
  ],
});

const INITIAL_ROWS: GridRow[] = Array.from({ length: 5 }, (_, i) =>
  createDefaultRow(`row-${i + 1}`)
);

export function BulkImportGrid() {
  const [rows, setRows] = React.useState<GridRow[]>(INITIAL_ROWS);
  const [manualItemPairsCount, setManualItemPairsCount] = React.useState<number>(3);
  const [isImporting, setIsImporting] = React.useState(false);
  const [currentChunk, setCurrentChunk] = React.useState(0);
  const [totalChunks, setTotalChunks] = React.useState(0);
  const [progressPercent, setProgressPercent] = React.useState(0);
  const [importStatus, setImportStatus] = React.useState<string>("");
  const [rawTextModalOpen, setRawTextModalOpen] = React.useState(false);
  const [rawTextInput, setRawTextInput] = React.useState("");

  const [stats, setStats] = React.useState<{
    processed: number;
    inserted: number;
    skippedDuplicates: number;
    newCustomersCreated: number;
    existingCustomersLinked: number;
  } | null>(null);

  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Compute maximum number of product-quantity pairs across rows
  const maxItemPairs = Math.max(
    manualItemPairsCount,
    3,
    ...rows.map((r) => r.items?.length || 0)
  );

  // Parse TSV / CSV text lines into GridRow objects
  // Sequence: date, invoice, note, name, phone number, address 1, address 2, three empty columns, bill, product, quantity...
  const parseSpreadsheetText = (text: string): GridRow[] => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return [];

    const newRows: GridRow[] = [];

    lines.forEach((line, index) => {
      // Split by tab (Excel/Sheets standard) or fallback to comma
      const cols = line.includes("\t")
        ? line.split("\t").map((c) => c.trim())
        : line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));

      // Skip header if detected in line 0
      if (
        index === 0 &&
        (cols[0]?.toLowerCase().includes("date") ||
          cols[1]?.toLowerCase().includes("invoice"))
      ) {
        return;
      }

      const [
        dateCol = "",
        invoiceCol = "",
        noteCol = "",
        nameCol = "",
        phoneCol = "",
        addr1Col = "",
        addr2Col = "",
        empty1Col = "",
        empty2Col = "",
        empty3Col = "",
        billCol = "",
      ] = cols;

      if (!invoiceCol && !nameCol && !phoneCol) {
        return; // skip blank rows
      }

      // Extract products and quantities starting from column index 11
      const items: ProductItem[] = [];
      for (let c = 11; c < cols.length; c += 2) {
        const prod = cols[c] || "";
        const qty = cols[c + 1] || "";
        if (prod || qty) {
          items.push({ product: prod, quantity: qty });
        }
      }

      // Ensure at least 3 item slots are available
      while (items.length < 3) {
        items.push({ product: "", quantity: "" });
      }

      newRows.push({
        id: `pasted-${Date.now()}-${index}`,
        date: parseDateToYMD(dateCol),
        invoice_id: invoiceCol,
        note: noteCol,
        name: nameCol || "Customer",
        phone: cleanPhoneNumber(phoneCol),
        addr1: addr1Col,
        addr2: addr2Col,
        col1: empty1Col,
        col2: empty2Col,
        col3: empty3Col,
        total_bill: billCol ? billCol.replace(/[^0-9.]/g, "") : "",
        items,
      });
    });

    return newRows;
  };

  // Handle direct paste event anywhere in the grid table
  const handleTablePaste = (e: React.ClipboardEvent<HTMLTableElement>) => {
    const clipboardData = e.clipboardData.getData("text");
    if (!clipboardData) return;

    e.preventDefault();
    const parsed = parseSpreadsheetText(clipboardData);
    if (parsed.length > 0) {
      setRows(parsed);
      setErrorMsg(null);
      setStats(null);
    }
  };

  // Import raw text modal submit
  const handleRawTextSubmit = () => {
    if (!rawTextInput.trim()) return;
    const parsed = parseSpreadsheetText(rawTextInput);
    if (parsed.length > 0) {
      setRows(parsed);
      setRawTextModalOpen(false);
      setRawTextInput("");
      setErrorMsg(null);
      setStats(null);
    }
  };

  // Update a standard cell
  const handleCellChange = (
    index: number,
    field: keyof Omit<GridRow, "items">,
    value: string | number
  ) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  // Update a product or quantity cell
  const handleItemChange = (
    rowIndex: number,
    itemIndex: number,
    field: "product" | "quantity",
    value: string
  ) => {
    setRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[rowIndex] };
      const items = [...(row.items || [])];
      while (items.length <= itemIndex) {
        items.push({ product: "", quantity: "" });
      }
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      row.items = items;
      updated[rowIndex] = row;
      return updated;
    });
  };

  // Add a blank row
  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      createDefaultRow(`row-${Date.now()}`),
    ]);
  };

  // Delete a specific row
  const handleDeleteRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear all rows
  const handleClear = () => {
    setRows(INITIAL_ROWS);
    setStats(null);
    setErrorMsg(null);
    setProgressPercent(0);
  };

  // Load sample data for immediate testing
  const handleLoadSample = (count: number = 250) => {
    const samples: GridRow[] = [];
    const baseDate = new Date();
    const demoPhones = [
      "01711000001",
      "01811000002",
      "01911000003",
      "01611000004",
      "01511000005",
      "01711000006",
      "01811000007",
    ];
    const demoProducts = [
      "Snuggly Palazzo - Coffee, XXL",
      "Snuggly Palazzo - Black, XXL",
      "Snuggly Palazzo - Mauve Pink / L",
      "Flared Leggings - Black / L",
      "Snuggly Palazzo - Orchid Purple, XXL",
      "Snuggly Palazzo - Aqua Blue, XXL",
    ];

    for (let i = 1; i <= count; i++) {
      const phoneIndex = i % demoPhones.length;
      const phone = demoPhones[phoneIndex];
      const invNum = 1000 + i;
      samples.push({
        id: `sample-${i}`,
        date: baseDate.toISOString().split("T")[0],
        invoice_id: `INV-2026-${invNum}`,
        note: i % 3 === 0 ? "VU11,WA" : i % 2 === 0 ? "120 paid" : "",
        name: `Customer ${phoneIndex + 1}`,
        phone: phone,
        addr1: `House ${10 + (i % 50)}, Road ${1 + (i % 20)}`,
        addr2: i % 2 === 0 ? "Dhanmondi, Dhaka" : "Gulshan-1, Dhaka",
        col1: "BD-13",
        col2: "",
        col3: "Cash on delivery",
        total_bill: (i % 4 + 1) * 600,
        items: [
          { product: demoProducts[i % demoProducts.length], quantity: "1" },
          { product: demoProducts[(i + 1) % demoProducts.length], quantity: "1" },
          { product: "", quantity: "" },
        ],
      });
    }

    setRows(samples);
    setStats(null);
    setErrorMsg(null);
  };

  // Execute chunked save to serverless API
  const handleSaveBulk = async () => {
    const validRows = rows.filter(
      (r) => r.invoice_id.trim() && r.phone.trim()
    );

    if (validRows.length === 0) {
      setErrorMsg("No valid rows to save. Please make sure Invoice ID and Phone are filled.");
      return;
    }

    setIsImporting(true);
    setErrorMsg(null);
    setStats(null);

    const chunks: GridRow[][] = [];
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      chunks.push(validRows.slice(i, i + CHUNK_SIZE));
    }

    setTotalChunks(chunks.length);
    setCurrentChunk(0);
    setProgressPercent(0);

    let accumulatedStats = {
      processed: 0,
      inserted: 0,
      skippedDuplicates: 0,
      newCustomersCreated: 0,
      existingCustomersLinked: 0,
    };

    try {
      for (let i = 0; i < chunks.length; i++) {
        setCurrentChunk(i + 1);
        setImportStatus(
          `Saving chunk ${i + 1} of ${chunks.length} (${chunks[i].length} rows)...`
        );

        const payload = chunks[i].map((r) => ({
          date: r.date,
          invoice_id: r.invoice_id,
          note: r.note,
          name: r.name,
          phone: r.phone,
          addr1: r.addr1,
          addr2: r.addr2,
          total_bill: r.total_bill,
          items: r.items,
        }));

        const res = await fetch("/api/nn-weblog/orders/bulk-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payload }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(
            errData.error || `Failed on chunk ${i + 1} of ${chunks.length}`
          );
        }

        const data = await res.json();
        accumulatedStats = {
          processed: accumulatedStats.processed + (data.processed || 0),
          inserted: accumulatedStats.inserted + (data.inserted || 0),
          skippedDuplicates:
            accumulatedStats.skippedDuplicates + (data.skippedDuplicates || 0),
          newCustomersCreated:
            accumulatedStats.newCustomersCreated + (data.newCustomersCreated || 0),
          existingCustomersLinked:
            accumulatedStats.existingCustomersLinked +
            (data.existingCustomersLinked || 0),
        };

        const percent = Math.round(((i + 1) / chunks.length) * 100);
        setProgressPercent(percent);
      }

      setStats(accumulatedStats);
      setImportStatus("Import completed successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setErrorMsg(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = rows.filter((r) => r.invoice_id.trim() && r.phone.trim()).length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Bulk Order Import Data Grid
            </h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
              Up to 5,000 Rows
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Paste spreadsheet rows directly (Ctrl+V) from Excel or Google Sheets. Columns: Date, Invoice, Note, Name, Phone, Addr1, Addr2, 3 Empty Cols, Bill, and Product/Quantity pairs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleLoadSample(250)}
            disabled={isImporting}
            className="gap-1.5 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <span>Load 250 Demo Rows</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRawTextModalOpen(true)}
            disabled={isImporting}
            className="gap-1.5 text-xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Paste Text Modal</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isImporting || rows.length === 0}
            className="gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </Button>

          <Button
            onClick={handleSaveBulk}
            disabled={isImporting || validCount === 0}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20"
          >
            <Database className="h-4 w-4" />
            <span>Save & Import ({validCount} Valid)</span>
          </Button>
        </div>
      </div>

      {/* Progress & Status Bar */}
      {isImporting && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6 dark:border-blue-900/60 dark:bg-blue-950/20 animate-in fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-blue-900 dark:text-blue-300">
              {importStatus}
            </span>
            <span className="text-sm font-mono font-bold text-blue-700 dark:text-blue-400">
              {progressPercent}%
            </span>
          </div>
          <Progress value={progressPercent} indicatorColor="bg-blue-600" />
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Chunk {currentChunk} of {totalChunks} ({CHUNK_SIZE} rows per batch)
            </span>
            <span>Vercel Serverless Safe • Zero Timeout Guaranteed</span>
          </div>
        </div>
      )}

      {/* Import Error Message */}
      {errorMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600" />
          <div>
            <div className="font-semibold">Import Error</div>
            <div>{errorMsg}</div>
          </div>
        </div>
      )}

      {/* Import Completed Stats */}
      {stats && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h3 className="font-bold text-emerald-900 dark:text-emerald-300">
              Bulk Import Successfully Completed
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl bg-white p-3.5 shadow-sm border border-emerald-100 dark:bg-slate-900 dark:border-slate-800">
              <div className="text-xs text-slate-500">Orders Inserted</div>
              <div className="text-2xl font-bold text-emerald-600">
                {stats.inserted.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-sm border border-emerald-100 dark:bg-slate-900 dark:border-slate-800">
              <div className="text-xs text-slate-500">Duplicate Invoices Skipped</div>
              <div className="text-2xl font-bold text-amber-600">
                {stats.skippedDuplicates.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-sm border border-emerald-100 dark:bg-slate-900 dark:border-slate-800">
              <div className="text-xs text-slate-500">New Customers Created</div>
              <div className="text-2xl font-bold text-blue-600">
                {stats.newCustomersCreated.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-sm border border-emerald-100 dark:bg-slate-900 dark:border-slate-800">
              <div className="text-xs text-slate-500">Existing Customers Linked</div>
              <div className="text-2xl font-bold text-indigo-600">
                {stats.existingCustomersLinked.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The Auto-Expanding Spreadsheet Grid */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3.5 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-500">
              Spreadsheet Grid ({rows.length.toLocaleString()} rows)
            </span>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-md font-medium">
              <ArrowRightLeft className="h-3 w-3" />
              <span>Scroll horizontally to view Notes, Bill, and Product/Quantity columns</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setManualItemPairsCount((prev) => Math.max(prev, maxItemPairs) + 1)
              }
              className="h-7 text-xs gap-1"
            >
              <Plus className="h-3 w-3" />
              <span>Add Product Column</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              className="h-7 text-xs gap-1"
            >
              <Plus className="h-3 w-3" />
              <span>Add Row</span>
            </Button>
          </div>
        </div>

        {/* Scrollable Container with overflow-x-auto */}
        <div className="w-full overflow-x-auto max-h-[620px] overflow-y-auto">
          <table
            onPaste={handleTablePaste}
            className="min-w-max w-full border-collapse text-left text-xs"
          >
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 shadow-sm">
              <tr>
                <th className="w-12 px-3 py-2.5 text-center font-mono font-semibold text-slate-400">#</th>
                <th className="w-36 px-3 py-2.5 font-semibold">Date</th>
                <th className="w-36 px-3 py-2.5 font-semibold">Invoice ID *</th>
                <th className="w-36 px-3 py-2.5 font-semibold text-amber-700 dark:text-amber-400">Note</th>
                <th className="w-44 px-3 py-2.5 font-semibold">Customer Name</th>
                <th className="w-36 px-3 py-2.5 font-semibold">Phone *</th>
                <th className="w-64 px-3 py-2.5 font-semibold">Address Line 1</th>
                <th className="w-40 px-3 py-2.5 font-semibold">Address Line 2</th>
                <th className="w-24 px-2 py-2.5 font-semibold text-slate-400">Empty 1</th>
                <th className="w-24 px-2 py-2.5 font-semibold text-slate-400">Empty 2</th>
                <th className="w-28 px-2 py-2.5 font-semibold text-slate-400">Empty 3</th>
                <th className="w-28 px-3 py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">Bill (৳)</th>
                {Array.from({ length: maxItemPairs }).map((_, i) => (
                  <React.Fragment key={`header-item-${i}`}>
                    <th className="w-56 px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200 border-l border-slate-200 dark:border-slate-700">
                      Product {i + 1}
                    </th>
                    <th className="w-20 px-2 py-2.5 font-semibold text-slate-800 dark:text-slate-200 text-center">
                      Qty {i + 1}
                    </th>
                  </React.Fragment>
                ))}
                <th className="w-12 px-2 py-2.5 text-center font-semibold">Del</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {rows.slice(0, 500).map((row, idx) => {
                const isValid = row.invoice_id.trim() && row.phone.trim();
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors ${
                      !isValid && row.invoice_id ? "bg-amber-50/30" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5 text-center font-mono text-slate-400 select-none">
                      {idx + 1}
                    </td>
                    <td className="p-1">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => handleCellChange(idx, "date", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="e.g. SC53380"
                        value={row.invoice_id}
                        onChange={(e) =>
                          handleCellChange(idx, "invoice_id", e.target.value)
                        }
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-medium text-xs text-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Note / Tag"
                        value={row.note}
                        onChange={(e) => handleCellChange(idx, "note", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-amber-800 dark:text-amber-300 font-medium"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Customer Name"
                        value={row.name}
                        onChange={(e) => handleCellChange(idx, "name", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="017xxxxxxxx"
                        value={row.phone}
                        onChange={(e) => handleCellChange(idx, "phone", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="House, Road, Area"
                        value={row.addr1}
                        onChange={(e) => handleCellChange(idx, "addr1", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="City, District"
                        value={row.addr2}
                        onChange={(e) => handleCellChange(idx, "addr2", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Empty 1"
                        value={row.col1}
                        onChange={(e) => handleCellChange(idx, "col1", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-400"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Empty 2"
                        value={row.col2}
                        onChange={(e) => handleCellChange(idx, "col2", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-400"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Empty 3"
                        value={row.col3}
                        onChange={(e) => handleCellChange(idx, "col3", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-400"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="0"
                        value={row.total_bill ?? ""}
                        onChange={(e) => handleCellChange(idx, "total_bill", e.target.value)}
                        className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200"
                      />
                    </td>
                    {Array.from({ length: maxItemPairs }).map((_, i) => {
                      const item = row.items?.[i] || { product: "", quantity: "" };
                      return (
                        <React.Fragment key={`row-${row.id}-item-${i}`}>
                          <td className="p-1 border-l border-slate-100 dark:border-slate-800/60">
                            <input
                              type="text"
                              placeholder={`Product ${i + 1}`}
                              value={item.product || ""}
                              onChange={(e) =>
                                handleItemChange(idx, i, "product", e.target.value)
                              }
                              className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-900 dark:text-slate-100"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              placeholder="1"
                              value={item.quantity || ""}
                              onChange={(e) =>
                                handleItemChange(idx, i, "quantity", e.target.value)
                              }
                              className="w-full rounded px-2 py-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs text-center"
                            />
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(idx)}
                        title="Remove row"
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length > 500 && (
            <div className="bg-slate-50 py-3 text-center text-xs text-slate-500 dark:bg-slate-800/50">
              Showing first 500 rows for display performance. All {rows.length.toLocaleString()} rows are loaded in memory and will be processed in chunks on save.
            </div>
          )}
        </div>
      </div>

      {/* Raw Text Paste Modal */}
      {rawTextModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
              Paste Raw TSV or CSV Data
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Columns sequence: Date, Invoice, Note, Name, Phone, Addr1, Addr2, 3 Empty Columns, Bill, Product, Quantity...
            </p>

            <textarea
              rows={12}
              value={rawTextInput}
              onChange={(e) => setRawTextInput(e.target.value)}
              placeholder="Paste rows directly here...&#10;2026-10-10 19:13	SC53380		Tanzima Nusrat	01675121790	house 1 Road 5...	Dhaka	BD-13		Cash on delivery	1200	Snuggly Palazzo - Coffee, XXL	1	Snuggly Palazzo - Black, XXL	1"
              className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRawTextModalOpen(false);
                  setRawTextInput("");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleRawTextSubmit} className="bg-blue-600 hover:bg-blue-700 text-white">
                Parse & Populate Grid
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

