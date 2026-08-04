'use client';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import api from '@/app/lib/api';

// ── Auth ──────────────────────────────────────────────────────────────────────
export function useLogin() {
  return useMutation({
    mutationFn: (data) => api.post('/auth/login', data).then((r) => r.data),
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
  });
}

export function useUsers(page = 1) {
  return useQuery({
    queryKey: ['users', page],
    queryFn: () => api.get('/users', { params: { page, limit: 20 } }).then((r) => r.data),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/users', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/users/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.patch('/users/me', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data) => api.patch('/users/me/password', data).then((r) => r.data),
  });
}

export function useDeleteMe() {
  return useMutation({
    mutationFn: () => api.delete('/users/me').then((r) => r.data),
  });
}

// ── Buildings ─────────────────────────────────────────────────────────────────
export function useFloors(buildingId) {
  return useQuery({
    queryKey: ['floors', buildingId],
    queryFn: () => api.get(`/buildings/${buildingId}/floors`).then((r) => r.data),
    enabled: !!buildingId,
  });
}

// ── Inspections ───────────────────────────────────────────────────────────────
export function useInspections(filters = {}) {
  return useInfiniteQuery({
    queryKey: ['inspections', filters],
    queryFn: ({ pageParam = 1 }) =>
      api.get('/inspections', { params: { ...filters, page: pageParam, limit: 20 } }).then((r) => r.data),
    getNextPageParam: (last) => last.page < last.pages ? last.page + 1 : undefined,
    initialPageParam: 1,
  });
}

export function useInspection(id) {
  return useQuery({
    queryKey: ['inspection', id],
    queryFn: () => api.get(`/inspections/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useStartInspection() {
  return useMutation({
    mutationFn: (data) => api.post('/inspections', data).then((r) => r.data),
  });
}

export function useSaveFloorForm() {
  return useMutation({
    mutationFn: ({ reportId, floorId, ...data }) =>
      api.patch(`/inspections/${reportId}/floors/${floorId}`, data).then((r) => r.data),
  });
}

export function useFinishInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post(`/inspections/${id}/finish`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inspections'] }),
  });
}

export function useSyncGoogleForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post(`/inspections/${id}/sync-google-form`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inspections'] }),
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────────
export function useCalendar(params) {
  return useQuery({
    queryKey: ['calendar', params],
    queryFn: () => api.get('/calendar', { params }).then((r) => r.data),
  });
}
