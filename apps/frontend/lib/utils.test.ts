import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('Tailwind 클래스를 병합한다', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('조건부 클래스를 처리한다', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });
});
