import { create } from 'zustand';
import type { Floor, FloorGeneralStatus, ItemStatus } from '@/types';

export interface FloorFormData {
  floorId: string;
  statusGeral: FloorGeneralStatus;
  notes: string;
  photos: string[];
  items: { itemName: string; status: ItemStatus; observation: string }[];
}

interface InspectionFlowState {
  reportId: string | null;
  buildingId: string | null;
  selectedFloors: Floor[];
  currentFloorIndex: number;
  formsData: Record<string, FloorFormData>;
  setReportId: (id: string) => void;
  setBuildingId: (id: string) => void;
  setSelectedFloors: (floors: Floor[]) => void;
  setCurrentFloorIndex: (i: number) => void;
  saveFloorData: (floorId: string, data: FloorFormData) => void;
  reset: () => void;
}

export const useInspectionFlowStore = create<InspectionFlowState>((set) => ({
  reportId: null,
  buildingId: null,
  selectedFloors: [],
  currentFloorIndex: 0,
  formsData: {},
  setReportId: (id) => set({ reportId: id }),
  setBuildingId: (id) => set({ buildingId: id }),
  setSelectedFloors: (floors) => set({ selectedFloors: floors, currentFloorIndex: 0, formsData: {} }),
  setCurrentFloorIndex: (i) => set({ currentFloorIndex: i }),
  saveFloorData: (floorId, data) =>
    set((s) => ({ formsData: { ...s.formsData, [floorId]: data } })),
  reset: () =>
    set({ reportId: null, buildingId: null, selectedFloors: [], currentFloorIndex: 0, formsData: {} }),
}));
