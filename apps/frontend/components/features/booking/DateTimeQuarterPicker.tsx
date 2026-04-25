'use client';

import { useEffect, useMemo, useState } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * 사용자 로컬 시간대 기준의 날짜(YYYY-MM-DD) + 시(0~23) + 분(00/15/30/45) 분리 입력.
 * 외부와는 ISO(UTC) 문자열 한 개로 동기화된다.
 *
 * - 분은 항상 15분 단위만 노출 — 백엔드 정책과 동일
 * - 빈 값은 빈 ISO 문자열로 폴백 (RHF의 required 검증이 잡도록)
 */
const QUARTERS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '00' },
  { value: 15, label: '15' },
  { value: 30, label: '30' },
  { value: 45, label: '45' },
];

const HOURS: ReadonlyArray<{ value: number; label: string }> = Array.from(
  { length: 24 },
  (_, h) => ({ value: h, label: h.toString().padStart(2, '0') }),
);

interface Parts {
  date: string; // YYYY-MM-DD (로컬)
  hour: string; // 0~23
  minute: string; // 0/15/30/45
}

function isoToParts(iso: string | undefined): Parts {
  if (!iso) return { date: '', hour: '', minute: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', hour: '', minute: '' };
  // 로컬 시각으로 분해 — UI는 사용자 wall clock으로 보여줌.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    hour: String(d.getHours()),
    minute: String(d.getMinutes()),
  };
}

function partsToIso(parts: Parts): string {
  if (!parts.date || parts.hour === '' || parts.minute === '') return '';
  const [y, m, d] = parts.date.split('-').map(Number);
  if (!y || !m || !d) return '';
  const local = new Date(y, m - 1, d, Number(parts.hour), Number(parts.minute), 0, 0);
  if (Number.isNaN(local.getTime())) return '';
  return local.toISOString();
}

export interface DateTimeQuarterPickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  /** 인라인 에러 메시지 (RHF formState.errors의 message). */
  error?: string;
  /** input/select에 한 번에 동일 prefix를 부여 — 라벨 연결 + 테스트 selector용. */
  required?: boolean;
}

export function DateTimeQuarterPicker({
  id,
  label,
  value,
  onChange,
  error,
  required,
}: DateTimeQuarterPickerProps): JSX.Element {
  // 로컬 분해 상태 — value(ISO) 변경에 따라 동기화하지만 사용자 입력 도중에는 부분 값을 허용.
  const initial = useMemo(() => isoToParts(value), [value]);
  const [parts, setParts] = useState<Parts>(initial);

  useEffect(() => {
    // 외부 value가 바뀌면 내부 parts도 동기화 (예: 모달 reset).
    setParts(isoToParts(value));
  }, [value]);

  const update = (next: Partial<Parts>): void => {
    const merged = { ...parts, ...next };
    setParts(merged);
    onChange(partsToIso(merged));
  };

  const dateId = `${id}-date`;
  const hourId = `${id}-hour`;
  const minuteId = `${id}-minute`;

  return (
    <div>
      <Label htmlFor={dateId}>{label}</Label>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
        <input
          id={dateId}
          type="date"
          value={parts.date}
          onChange={(e) => update({ date: e.target.value })}
          required={required}
          aria-invalid={Boolean(error)}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            error && 'border-destructive',
          )}
        />
        <select
          id={hourId}
          aria-label={`${label} 시`}
          value={parts.hour}
          onChange={(e) => update({ hour: e.target.value })}
          required={required}
          aria-invalid={Boolean(error)}
          className={cn(
            'h-10 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            error && 'border-destructive',
          )}
        >
          <option value="">--</option>
          {HOURS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}시
            </option>
          ))}
        </select>
        <select
          id={minuteId}
          aria-label={`${label} 분`}
          value={parts.minute}
          onChange={(e) => update({ minute: e.target.value })}
          required={required}
          aria-invalid={Boolean(error)}
          className={cn(
            'h-10 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            error && 'border-destructive',
          )}
        >
          <option value="">--</option>
          {QUARTERS.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}분
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
