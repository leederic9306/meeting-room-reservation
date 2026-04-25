import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { DateTimeQuarterPicker } from './DateTimeQuarterPicker';

function Harness({ initial }: { initial: string }): JSX.Element {
  const [iso, setIso] = useState(initial);
  return (
    <>
      <DateTimeQuarterPicker id="t" label="시작" value={iso} onChange={setIso} />
      <output data-testid="iso">{iso}</output>
    </>
  );
}

describe('DateTimeQuarterPicker', () => {
  it('15분 단위 옵션만 노출 (00/15/30/45)', () => {
    render(<Harness initial="" />);
    const minute = screen.getByLabelText('시작 분') as HTMLSelectElement;
    const labels = Array.from(minute.options).map((o) => o.textContent);
    // 첫 옵션은 placeholder('--'), 그 이후가 분.
    expect(labels).toEqual(['--', '00분', '15분', '30분', '45분']);
  });

  it('초깃값 ISO를 로컬 분해된 값으로 표시', () => {
    // 서울(UTC+9) 기준으로 14:30이 되는 시각.
    const local = new Date(2026, 3, 25, 14, 30, 0, 0); // month는 0-indexed
    render(<Harness initial={local.toISOString()} />);
    expect((screen.getByLabelText('시작 시') as HTMLSelectElement).value).toBe('14');
    expect((screen.getByLabelText('시작 분') as HTMLSelectElement).value).toBe('30');
  });

  it('날짜/시/분이 모두 채워져야 ISO를 onChange로 내보낸다', () => {
    render(<Harness initial="" />);
    const date = screen.getByLabelText('시작') as HTMLInputElement;
    const hour = screen.getByLabelText('시작 시') as HTMLSelectElement;
    const minute = screen.getByLabelText('시작 분') as HTMLSelectElement;

    fireEvent.change(date, { target: { value: '2026-04-25' } });
    expect(screen.getByTestId('iso').textContent).toBe(''); // 시/분 미입력

    fireEvent.change(hour, { target: { value: '14' } });
    expect(screen.getByTestId('iso').textContent).toBe(''); // 분 미입력

    fireEvent.change(minute, { target: { value: '15' } });
    const iso = screen.getByTestId('iso').textContent ?? '';
    // 라운드트립 — 다시 분해해서 동일한 값이 나오는지.
    const back = new Date(iso);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(3);
    expect(back.getDate()).toBe(25);
    expect(back.getHours()).toBe(14);
    expect(back.getMinutes()).toBe(15);
  });

  it('error prop이 있으면 role=alert 메시지 노출', () => {
    render(
      <DateTimeQuarterPicker
        id="t"
        label="시작"
        value=""
        onChange={() => {}}
        error="시작 시간을 선택해주세요."
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('시작 시간을 선택해주세요.');
  });
});
