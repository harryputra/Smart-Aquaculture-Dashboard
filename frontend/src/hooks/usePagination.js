import { useState, useMemo } from 'react';

// Pagination murni client-side: `data` sudah harus array PENUH yang sudah
// dimuat (bukan dipotong sebagian) -- hook ini yang memotongnya per halaman.
export function usePagination(data, defaultPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Kalau dataset menyusut (mis. setelah reload data lebih sedikit), jangan
  // biarkan `page` nyangkut di luar jangkauan -- baru dipakai utk hitung
  // pageData, TIDAK memanggil setPage (hindari efek samping di render).
  const safePage = Math.min(page, totalPages);

  const pageData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  function setPageSize(newSize) {
    setPageSizeRaw(newSize);
    setPage(1);   // ukuran halaman berubah -> mulai lagi dari halaman 1
  }

  return { page: safePage, setPage, pageSize, setPageSize, pageData, totalPages, totalItems };
}
