import { BulkImportGrid } from "@/components/weblog/bulk-import-grid";

export const metadata = {
  title: "Bulk Import Orders | NN Weblog",
  description: "Bulk data import grid supporting up to 5,000 rows with serverless chunking",
};

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <BulkImportGrid />
    </div>
  );
}
