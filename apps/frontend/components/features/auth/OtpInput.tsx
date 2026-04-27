'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';

import { cn } from '@/lib/utils';

interface OtpInputProps {
  /** 자릿수 — 기본 6 */
  length?: number;
  /** react-hook-form 의 controlled value (string of digits). */
  value: string;
  onChange: (value: string) => void;
  /** 첫 칸 자동 포커스 */
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export interface OtpInputHandle {
  focus: () => void;
}

/**
 * OtpInput — docs/07-design.md §5.3
 *
 * 6자리 숫자 코드를 칸별로 분리한 입력. 한 칸 입력 → 다음 칸 자동 포커스,
 * Backspace → 이전 칸, 붙여넣기 → 자릿수만큼 분배. value 는 항상 digit-only string.
 */
export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { length = 6, value, onChange, autoFocus, disabled, ariaLabel = '인증 코드' },
  ref,
): JSX.Element {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // 부모에서 첫 칸 포커스/리셋이 가능하도록 imperative handle 노출.
  useImperativeHandle(ref, () => ({
    focus: () => inputs.current[0]?.focus(),
  }));

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, [autoFocus]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  function setDigitAt(index: number, digit: string): void {
    const arr = digits.slice();
    arr[index] = digit;
    onChange(arr.join(''));
  }

  function handleChange(index: number, raw: string): void {
    // 숫자만 허용 + 가장 최근 입력 한 글자만 사용 (덮어쓰기 동작)
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit && raw !== '') return;
    setDigitAt(index, digit);
    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigitAt(index, '');
      } else if (index > 0) {
        inputs.current[index - 1]?.focus();
        setDigitAt(index - 1, '');
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputs.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputs.current[index + 1]?.focus();
      e.preventDefault();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>): void {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text.padEnd(value.length, '').slice(0, length));
    const lastIndex = Math.min(text.length, length - 1);
    inputs.current[lastIndex]?.focus();
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex justify-center gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`${ariaLabel} ${i + 1}/${length}`}
          className={cn(
            'h-14 w-12 rounded-lg border bg-white text-center text-xl font-semibold tabular text-neutral-900',
            'border-neutral-200 transition-all',
            'hover:border-neutral-300',
            'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100',
            'disabled:cursor-not-allowed disabled:bg-neutral-50',
          )}
        />
      ))}
    </div>
  );
});
