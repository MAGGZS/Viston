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

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`).then((r) => r.data),
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
export function useLeaveBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (buildingId) => api.delete(`/buildings/${buildingId}/members/me`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-buildings'] }),
  });
}

export function useMyBuildings() {
  return useQuery({
    queryKey: ['my-buildings'],
    queryFn: () => api.get('/buildings/me').then((r) => r.data),
  });
}

export function useBuildings() {
  return useQuery({
    queryKey: ['buildings'],
    queryFn: () => api.get('/buildings').then((r) => r.data),
  });
}

export function useBuildingDashboard(id) {
  return useQuery({
    queryKey: ['building-dashboard', id],
    queryFn: () => api.get(`/buildings/${id}/dashboard`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useBuildingHistory(id, params = {}) {
  return useInfiniteQuery({
    queryKey: ['building-history', id, params],
    queryFn: ({ pageParam = 1 }) =>
      api.get(`/buildings/${id}/history`, { params: { ...params, page: pageParam, limit: 20 } }).then((r) => r.data),
    getNextPageParam: (last) => last.page < last.pages ? last.page + 1 : undefined,
    initialPageParam: 1,
    enabled: !!id,
  });
}

export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/buildings', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}

export function useUpdateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/buildings/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}

export function useDeleteBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/buildings/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}

export function useCreateFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, ...data }) => api.post(`/buildings/${buildingId}/floors`, data).then((r) => r.data),
    onSuccess: (_, { buildingId }) => qc.invalidateQueries({ queryKey: ['floors', buildingId] }),
  });
}

export function useDeleteFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, floorId }) => api.delete(`/buildings/${buildingId}/floors/${floorId}`).then((r) => r.data),
    onSuccess: (_, { buildingId }) => qc.invalidateQueries({ queryKey: ['floors', buildingId] }),
  });
}

export function useBuildingMembers(id) {
  return useQuery({
    queryKey: ['building-members', id],
    queryFn: () => api.get(`/buildings/${id}/members`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, userId }) => api.delete(`/buildings/${buildingId}/members/${userId}`).then((r) => r.data),
    onSuccess: (_, { buildingId }) => qc.invalidateQueries({ queryKey: ['building-members', buildingId] }),
  });
}

export function useRequestAccess() {
  return useMutation({
    mutationFn: (buildingId) => api.post(`/buildings/${buildingId}/access-requests`).then((r) => r.data),
  });
}

export function useAccessRequests(buildingId) {
  return useQuery({
    queryKey: ['access-requests', buildingId],
    queryFn: () => api.get(`/buildings/${buildingId}/access-requests`, { params: { status: 'PENDING' } }).then((r) => r.data),
    enabled: !!buildingId,
  });
}

export function useReviewAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, requestId, status }) =>
      api.patch(`/buildings/${buildingId}/access-requests/${requestId}`, { status }).then((r) => r.data),
    onSuccess: (_, { buildingId }) => {
      qc.invalidateQueries({ queryKey: ['access-requests', buildingId] });
      qc.invalidateQueries({ queryKey: ['building-members', buildingId] });
    },
  });
}

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

// ── Calendar ──────────────────────────────────────────────────────────────────
export function useCalendar(params) {
  return useQuery({
    queryKey: ['calendar', params],
    queryFn: () => api.get('/calendar', { params }).then((r) => r.data),
  });
}
