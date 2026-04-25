import { api, unwrap } from './axios';
import type { RoomDto } from './bookings';

// ---- Rooms (admin) -------------------------------------------------------

export interface CreateRoomInput {
  name: string;
  capacity?: number;
  location?: string;
  description?: string;
  displayOrder?: number;
}

export interface UpdateRoomInput {
  name?: string;
  capacity?: number | null;
  location?: string | null;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number;
}

/** 비활성 포함 전체 — 관리자 화면 전용. */
export async function listAllRooms(): Promise<RoomDto[]> {
  const res = await api.get<{ data: RoomDto[] }>('/rooms', {
    params: { includeInactive: true },
  });
  return unwrap(res.data);
}

export async function createRoom(input: CreateRoomInput): Promise<RoomDto> {
  const res = await api.post<{ data: RoomDto }>('/rooms', input);
  return unwrap(res.data);
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<RoomDto> {
  const res = await api.patch<{ data: RoomDto }>(`/rooms/${id}`, input);
  return unwrap(res.data);
}

export async function deleteRoom(id: string): Promise<void> {
  await api.delete(`/rooms/${id}`);
}

// ---- Users (admin) -------------------------------------------------------

export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'LOCKED' | 'DELETED';

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  department: string | null;
  employeeNo: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface ListUsersParams {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  limit?: number;
}

export interface PaginatedUsers {
  data: AdminUserDto[];
  meta: PaginationMeta;
}

export async function listAdminUsers(params: ListUsersParams): Promise<PaginatedUsers> {
  // 빈 문자열은 백엔드가 "값 있음"으로 처리하므로 제거.
  const cleaned: Record<string, string | number> = {};
  if (params.search) cleaned.search = params.search;
  if (params.role) cleaned.role = params.role;
  if (params.status) cleaned.status = params.status;
  if (params.page) cleaned.page = params.page;
  if (params.limit) cleaned.limit = params.limit;

  const res = await api.get<PaginatedUsers>('/admin/users', { params: cleaned });
  return res.data;
}

export async function updateUserRole(id: string, role: UserRole): Promise<AdminUserDto> {
  const res = await api.patch<{ data: AdminUserDto }>(`/admin/users/${id}/role`, { role });
  return unwrap(res.data);
}
