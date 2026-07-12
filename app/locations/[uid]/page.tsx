import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function LocationPage({ params }: { params: { uid: string } }) {
  const location = await prisma.location.findUnique({
    where: { uid: params.uid },
    include: {
      inventory: {
        include: {
          product: true
        }
      }
    }
  });

  if (!location) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-red-600 mb-4">Location Not Found</h1>
          <p className="text-gray-600 mb-6">We couldn't find a location matching this QR code.</p>
          <Link href="/inventory" className="text-blue-600 font-bold hover:underline">Return to Inventory Dashboard</Link>
        </div>
      </div>
    );
  }

  const totalQty = location.inventory.reduce((sum, inv) => sum + inv.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <span className="bg-blue-100 text-blue-800 text-sm font-bold px-3 py-1 rounded-full">{location.uid}</span>
            <h1 className="text-3xl font-black mt-2 text-gray-900">{location.name}</h1>
            {location.notes && <p className="text-gray-500 mt-2">{location.notes}</p>}
          </div>
          <div className="text-center md:text-right bg-gray-50 p-4 rounded-lg border border-gray-100 min-w-[200px]">
            <p className="text-sm font-bold text-gray-500 uppercase">Total Items Here</p>
            <p className="text-4xl font-black text-blue-600">{totalQty}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800">Inventory Contents</h2>
          </div>
          
          {location.inventory.length === 0 ? (
            <div className="p-8 text-center text-gray-500 italic">
              This location is currently empty.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-100 text-gray-700 text-sm">
                  <tr>
                    <th className="p-4 border-b font-bold">Item Type</th>
                    <th className="p-4 border-b font-bold">Product Name</th>
                    <th className="p-4 border-b font-bold">SKU</th>
                    <th className="p-4 border-b font-bold text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {location.inventory.map(inv => (
                    <tr key={inv.id} className="border-b last:border-b-0 hover:bg-blue-50 transition-colors">
                      <td className="p-4">
                        <span className={`px-2 py-1 text-xs font-bold rounded ${inv.product.type === 'SUPPLY' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                          {inv.product.type === 'SUPPLY' ? 'Supply' : 'Product'}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-gray-900">{inv.product.name}</td>
                      <td className="p-4 text-gray-600">{inv.product.sku || '-'}</td>
                      <td className="p-4 text-right font-mono font-bold text-lg">{inv.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        <div className="mt-8 text-center">
          <Link href="/inventory" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow">
            Go to Inventory Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}