'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import api from '@/lib/api';
import { InspectionList } from '@/components/InspectionList';

export default function HistoricoPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['inspections', page],
    queryFn: () => api.get(`/inspections?page=${page}&limit=20`).then((r) => r.data),
    keepPreviousData: true,
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  const filtered = (data?.data || []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.inspector.name.toLowerCase().includes(q) ||
      r.floorEntries?.some((e) => e.floor.label.toLowerCase().includes(q))
    );
  });

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      <h1 className="text-xl font-extrabold mb-4">Histórico</h1>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
        <input
          type="search"
          placeholder="Buscar por inspetor ou andar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      <InspectionList inspections={filtered} isLoading={isLoading} />

      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-6 pb-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="flex items-center text-sm text-text-secondary">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
