import type { ReactNode } from 'react';

/**
 * 인증 페이지 폼 상단의 제목 + 설명 — Card 헤더 대체용 (docs/07-design.md §5.2).
 * 화면 정중앙 카드 패턴 대신, 폼이 패널 안에서 바로 시작되도록 한다.
 */
export function AuthFormHeader({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-8">
      <h2 className="text-h2 font-semibold tracking-tight text-neutral-900">{title}</h2>
      {description ? <p className="mt-2 text-sm text-neutral-500">{description}</p> : null}
    </div>
  );
}
