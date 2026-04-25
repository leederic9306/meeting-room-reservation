import { describe, expect, it } from 'vitest';

import {
  ceilToQuarter,
  fromLocalInputValue,
  isQuarterAligned,
  toLocalInputValue,
} from './datetime';

describe('datetime utils', () => {
  describe('isQuarterAligned', () => {
    it('15분 경계는 true', () => {
      expect(isQuarterAligned(new Date('2026-04-25T05:00:00.000Z'))).toBe(true);
      expect(isQuarterAligned(new Date('2026-04-25T05:15:00.000Z'))).toBe(true);
      expect(isQuarterAligned(new Date('2026-04-25T05:45:00.000Z'))).toBe(true);
    });

    it('15분 경계가 아니면 false', () => {
      expect(isQuarterAligned(new Date('2026-04-25T05:07:00.000Z'))).toBe(false);
      expect(isQuarterAligned(new Date('2026-04-25T05:00:30.000Z'))).toBe(false);
      expect(isQuarterAligned(new Date('2026-04-25T05:00:00.500Z'))).toBe(false);
    });
  });

  describe('ceilToQuarter', () => {
    it('이미 15분 경계면 그대로', () => {
      const d = new Date('2026-04-25T05:30:00.000Z');
      expect(ceilToQuarter(d).toISOString()).toBe('2026-04-25T05:30:00.000Z');
    });

    it('1분 지난 시각은 다음 15분 경계로 올림', () => {
      const d = new Date('2026-04-25T05:01:00.000Z');
      expect(ceilToQuarter(d).toISOString()).toBe('2026-04-25T05:15:00.000Z');
    });

    it('14분은 15분으로', () => {
      const d = new Date('2026-04-25T05:14:00.000Z');
      expect(ceilToQuarter(d).toISOString()).toBe('2026-04-25T05:15:00.000Z');
    });
  });

  describe('toLocalInputValue / fromLocalInputValue 라운드트립', () => {
    it('datetime-local 입력 → ISO → 입력으로 동일하게 복원', () => {
      const original = '2026-04-25T14:30';
      const iso = fromLocalInputValue(original);
      const back = toLocalInputValue(new Date(iso));
      expect(back).toBe(original);
    });
  });
});
