import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { CalendarDay } from '@/types';

export function useCalendarMonth(year: number, month: number) {
  return useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () =>
      api
        .get<Record<string, CalendarDay>>('/calendar', { params: { year, month } })
        .then((r) => r.data),
  });
}

export function useCalendarRange(range: 'semestral' | 'anual') {
  return useQuery({
    queryKey: ['calendar', range],
    queryFn: () =>
      api.get<Record<string, number>>('/calendar', { params: { range } }).then((r) => r.data),
  });
}
