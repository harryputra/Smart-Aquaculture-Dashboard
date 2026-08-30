import { useState } from 'react';
import ExcelJS from 'exceljs';
import { FileSpreadsheet } from 'lucide-react';

// `columns`: Array<{ header: string, accessor: string | (row) => any }>
// `data` HARUS array penuh (bukan hasil pagination) -- export selalu
// mencakup semua baris terlepas dari halaman yang sedang dilihat user.
//
// Pakai `exceljs`, BUKAN `xlsx`/SheetJS -- versi `xlsx` di npm registry
// punya 2 kerentanan HIGH (Prototype Pollution, ReDoS) tanpa fix tersedia.
// `exceljs` tidak punya helper unduh built-in seperti `XLSX.writeFile`,
// jadi unduhan dipicu manual lewat Blob + object URL.
export default function ExportExcelButton({ data, columns, filename, sheetName = 'Data' }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetName);
      ws.columns = columns.map((col) => ({ header: col.header, key: col.header, width: 22 }));
      data.forEach((row) => {
        const out = {};
        columns.forEach((col) => {
          out[col.header] = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
        });
        ws.addRow(out);
      });
      ws.getRow(1).font = { bold: true };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      const a = document.createElement('a');
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport} disabled={busy || !data || data.length === 0}>
      <FileSpreadsheet size={14} /> {busy ? 'Menyiapkan...' : 'Export Excel'}
    </button>
  );
}
