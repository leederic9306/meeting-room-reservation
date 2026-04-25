import { describe, expect, it } from 'vitest';

import type { RoomDto } from '@/lib/api/bookings';

import { ROOM_COLOR_PALETTE, buildRoomColorMap, getRoomColor } from './room-colors';

const buildRoom = (overrides: Partial<RoomDto> & { id: string; name: string }): RoomDto => ({
  capacity: null,
  location: null,
  description: null,
  isActive: true,
  displayOrder: 0,
  ...overrides,
});

describe('buildRoomColorMap', () => {
  it('displayOrder 오름차순으로 팔레트 색을 부여한다', () => {
    const rooms: RoomDto[] = [
      buildRoom({ id: 'r3', name: 'C', displayOrder: 2 }),
      buildRoom({ id: 'r1', name: 'A', displayOrder: 0 }),
      buildRoom({ id: 'r2', name: 'B', displayOrder: 1 }),
    ];

    const map = buildRoomColorMap(rooms);

    expect(map.get('r1')).toBe(ROOM_COLOR_PALETTE[0]);
    expect(map.get('r2')).toBe(ROOM_COLOR_PALETTE[1]);
    expect(map.get('r3')).toBe(ROOM_COLOR_PALETTE[2]);
  });

  it('displayOrder가 같으면 이름 사전순으로 안정 정렬', () => {
    const rooms: RoomDto[] = [
      buildRoom({ id: 'r-b', name: '회의실 B', displayOrder: 0 }),
      buildRoom({ id: 'r-a', name: '회의실 A', displayOrder: 0 }),
    ];

    const map = buildRoomColorMap(rooms);

    expect(map.get('r-a')).toBe(ROOM_COLOR_PALETTE[0]);
    expect(map.get('r-b')).toBe(ROOM_COLOR_PALETTE[1]);
  });

  it('11번째부터는 팔레트가 순환', () => {
    const rooms: RoomDto[] = Array.from({ length: 11 }, (_, i) =>
      buildRoom({ id: `r${i}`, name: `Room ${i}`, displayOrder: i }),
    );

    const map = buildRoomColorMap(rooms);

    expect(map.get('r0')).toBe(ROOM_COLOR_PALETTE[0]);
    expect(map.get('r10')).toBe(ROOM_COLOR_PALETTE[0]);
  });
});

describe('getRoomColor', () => {
  it('미등록 id는 기본색(fallback)을 반환', () => {
    const map = buildRoomColorMap([]);
    expect(getRoomColor(map, 'unknown')).toBe('#6b7280');
  });
});
