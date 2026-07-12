const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf8');

// 1. Import
if (!code.includes('ReadyToPackageView')) {
  code = code.replace(
    "import { Html5QrcodeScanner } from 'html5-qrcode';",
    "import { Html5QrcodeScanner } from 'html5-qrcode';\nimport ReadyToPackageView from './ReadyToPackageView';"
  );
}

// 2. Active View Type & State
code = code.replace(
  'useState<"main" | "printFilter" | "scanner" | "factoryReport">("main");',
  'useState<"main" | "printFilter" | "scanner" | "factoryReport" | "readyToPackage">("main");'
);

// 3. Add shortages state
if (!code.includes('const [shortages, setShortages]')) {
  code = code.replace(
    'const [error, setError] = useState<string | null>(null);',
    'const [error, setError] = useState<string | null>(null);\n  const [shortages, setShortages] = useState<Record<string, number>>({});'
  );
}

// 4. Update fetchOrders
const fetchOrdersOld = `  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/orders");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);`;

const fetchOrdersNew = `  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const [ordRes, shortRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/inventory/factory-shortages")
      ]);
      const json = await ordRes.json();
      const shortJson = await shortRes.json();
      
      if (!json.success) throw new Error(json.error);
      if (shortJson.success) setShortages(shortJson.data);`;

code = code.replace(fetchOrdersOld, fetchOrdersNew);

// 5. Add Ready to Package button (around line 558)
const buttonOld = `<button onClick={() => setActiveView("factoryReport")} className="bg-orange-600 text-white px-6 py-2 rounded-md font-bold hover:bg-orange-700 shadow-md">🏭 Factory Report</button>`;
const buttonNew = `<button onClick={() => setActiveView("factoryReport")} className="bg-orange-600 text-white px-6 py-2 rounded-md font-bold hover:bg-orange-700 shadow-md">🏭 Factory Report</button>
                <button onClick={() => setActiveView("readyToPackage")} className="bg-green-600 text-white px-6 py-2 rounded-md font-bold hover:bg-green-700 shadow-md">📦 Ready to Package</button>`;
code = code.replace(buttonOld, buttonNew);

// 6. Add Shortages note to the ON SCREEN factory report (not the print one)
// The on screen one has `isSearching`
const qtyOld = `{item.qty}
                                <button`;
const qtyNew = `{item.qty}
                                {shortages[item.name.toLowerCase()] > 0 && (
                                  <span className="ml-2 text-xs text-red-600 font-bold">
                                    ({shortages[item.name.toLowerCase()]}* urgent)
                                  </span>
                                )}
                                <button`;
// We only want to replace the first occurrence (which is the on-screen one)
code = code.replace(qtyOld, qtyNew);

// 7. Render ReadyToPackageView at the bottom
// The file ends with:
//         )}
//       </div>
//     </>
//   );
// }

const endOld = `        )}
      </div>
    </>
  );
}`;

const endNew = `        )}
        {/* Ready To Package View */}
        {activeView === "readyToPackage" && (
          <ReadyToPackageView onBack={() => setActiveView("main")} />
        )}
      </div>
    </>
  );
}`;
code = code.replace(endOld, endNew);

fs.writeFileSync('app/page.tsx', code);
console.log("Patched successfully");
