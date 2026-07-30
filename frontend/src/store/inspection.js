import { create } from 'zustand';

export const useInspectionStore = create((set, get) => ({
  reportId: null,
  selectedFloors: [],
  currentFloorIndex: 0,
  entries: {}, // floorId -> form data

  start: (reportId, floors) => set({ reportId, selectedFloors: floors, currentFloorIndex: 0, entries: {} }),

  saveEntry: (floorId, data) =>
    set((s) => ({ entries: { ...s.entries, [floorId]: data } })),

  nextFloor: () =>
    set((s) => ({ currentFloorIndex: Math.min(s.currentFloorIndex + 1, s.selectedFloors.length - 1) })),

  getCurrentFloor: () => {
    const s = get();
    return s.selectedFloors[s.currentFloorIndex] || null;
  },

  isLastFloor: () => {
    const s = get();
    return s.currentFloorIndex === s.selectedFloors.length - 1;
  },

  reset: () => set({ reportId: null, selectedFloors: [], currentFloorIndex: 0, entries: {} }),
}));
