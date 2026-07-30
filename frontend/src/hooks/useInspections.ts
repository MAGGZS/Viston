import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { InspectionReport, PaginatedResponse } from '@/types';

interface InspectionFilters {
  page?: number;
  limit?: number;
  inspectorId?: string;
  floorId?: string;
  startDate?: string;
  endDate?: string;
}

export function useInspections(filters: InspectionFilters = {}) {
  return useQuery({
    queryKey: ['inspections', filters],
    queryFn: () =>
      api
        .get<PaginatedResponse<InspectionReport>>('/inspections', { params: filters })
        .then((r) => r.data),
  });
}

export function useInspection(id: string) {
  return useQuery({
    queryKey: ['inspections', id],
    queryFn: () => api.get<InspectionReport>(`/inspections/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useStartInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { buildingId: string; floorIds: string[] }) =>
      api.post<InspectionReport>('/inspections', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inspections'] }),
  });
}

export function useSaveFloorForm() {
  return useMutation({
    mutationFn: ({
      reportId,
      floorId,
      data,
    }: {
      reportId: string;
      floorId: string;
      data: any;
    }) =>
      api.patch(`/inspections/${reportId}/floors/${floorId}`, data).then((r) => r.data),
  });
}

export function useFinishInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) =>
      api.post<InspectionReport>(`/inspections/${reportId}/finish`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}
