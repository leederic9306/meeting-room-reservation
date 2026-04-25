import type { RoomDto } from '@/lib/api/bookings';

/**
 * 회의실별 고정 색상 팔레트.
 * Tailwind 600 톤을 기준으로 충분히 구분되는 10색 — 한 화면에 동시에 보일 회의실은 최대 10개.
 */
export const ROOM_COLOR_PALETTE = [
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#db2777', // pink-600
  '#65a30d', // lime-600
  '#0284c7', // sky-600
  '#ea580c', // orange-600
] as const;

const FALLBACK_COLOR = '#6b7280'; // gray-500

/**
 * displayOrder + name 기준으로 정렬한 안정적 인덱스로 색을 매핑한다.
 * 같은 회의실은 항상 같은 색을 갖도록 보장 — UX 일관성.
 */
export function buildRoomColorMap(rooms: readonly RoomDto[]): Map<string, string> {
  const sorted = [...rooms].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.name.localeCompare(b.name, 'ko');
  });

  const map = new Map<string, string>();
  sorted.forEach((room, index) => {
    map.set(room.id, ROOM_COLOR_PALETTE[index % ROOM_COLOR_PALETTE.length] ?? FALLBACK_COLOR);
  });
  return map;
}

export function getRoomColor(map: Map<string, string>, roomId: string): string {
  return map.get(roomId) ?? FALLBACK_COLOR;
}
