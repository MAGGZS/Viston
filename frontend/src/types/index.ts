export type Role = 'ADMIN' | 'INSPECTOR' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'DELETED';
export type InspectionStatus = 'IN_PROGRESS' | 'COMPLETED';
export type ItemStatus = 'OK' | 'NOK' | 'NA';
export type FloorGeneralStatus = 'OK' | 'ATENCAO' | 'PROBLEMA';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Floor {
  id: string;
  buildingId: string;
  label: string;
  number: number;
  order: number;
}

export interface Building {
  id: string;
  name: string;
  floors: Floor[];
}

export interface FormItemResponse {
  id: string;
  itemName: string;
  status: ItemStatus;
  observation: string | null;
}

export interface FloorFormEntry {
  id: string;
  floorId: string;
  floor: Floor;
  statusGeral: FloorGeneralStatus;
  notes: string | null;
  photos: string[];
  completedAt: string | null;
  items: FormItemResponse[];
}

export interface InspectionReport {
  id: string;
  inspectorId: string;
  inspector: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  buildingId: string;
  building: Pick<Building, 'id' | 'name'>;
  date: string;
  startedAt: string;
  finishedAt: string | null;
  floorsInspected: string[];
  status: InspectionStatus;
  pdfUrl: string | null;
  excelUrl: string | null;
  createdAt: string;
  floorEntries: FloorFormEntry[];
}

export interface CalendarDay {
  count: number;
  inspectors: Pick<User, 'id' | 'name' | 'avatarUrl'>[];
  reportIds: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'avatarUrl'>;
}
