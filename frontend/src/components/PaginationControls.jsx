import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function PaginationControls({ page, totalPages, totalItems, pageSize, setPage, setPageSize }) {
  if (totalItems === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
      gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-primary)',
    }}>
      <div className="text-xs text-muted">
        Menampilkan {start.toLocaleString('id-ID')}–{end.toLocaleString('id-ID')} dari {totalItems.toLocaleString('id-ID')} baris
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Tampilkan:
          <select className="form-select" style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}
            value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Halaman sebelumnya">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs" style={{ minWidth: 64, textAlign: 'center' }}>Hal {page}/{totalPages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Halaman berikutnya">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
