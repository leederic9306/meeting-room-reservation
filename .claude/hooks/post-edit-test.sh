#!/usr/bin/env bash
# =============================================================================
# Post-Edit Test Hook
# =============================================================================
# 파일 변경 후 관련 테스트를 자동 실행합니다.
# 변경된 파일의 패키지를 자동 감지하여 해당 패키지의 테스트만 실행.
#
# 환경변수:
#   $1 또는 $CLAUDE_FILE_PATHS — 변경된 파일 경로(콤마 구분)
# =============================================================================

set -e

CHANGED_FILES="${1:-$CLAUDE_FILE_PATHS}"

# 변경 파일 없으면 종료
if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# 코드 파일이 아니면 종료 (md, json 등은 테스트 불필요)
if ! echo "$CHANGED_FILES" | grep -qE '\.(ts|tsx|js|jsx)$'; then
  exit 0
fi

# 테스트 파일은 제외 (테스트가 테스트를 트리거하면 무한 루프)
# 단, .spec.ts/.test.tsx 추가 시에도 그 파일의 source를 같이 수정하는 경우는
# Claude가 PostToolUse 한 번에 묶어서 처리하므로 문제 없음

# 영향받은 패키지 감지
AFFECTED=""
if echo "$CHANGED_FILES" | grep -q "apps/backend/"; then
  AFFECTED="$AFFECTED backend"
fi
if echo "$CHANGED_FILES" | grep -q "apps/frontend/"; then
  AFFECTED="$AFFECTED frontend"
fi
if echo "$CHANGED_FILES" | grep -q "packages/shared-types/"; then
  AFFECTED="$AFFECTED backend frontend"
fi

# 영향 패키지 없으면 종료
if [ -z "$AFFECTED" ]; then
  exit 0
fi

# 중복 제거
AFFECTED=$(echo "$AFFECTED" | tr ' ' '\n' | sort -u | tr '\n' ' ')

# 각 패키지별 테스트 실행 (관련 파일만, 빠르게)
for pkg in $AFFECTED; do
  echo "🧪 테스트 실행: $pkg (변경 파일 관련)"
  # --findRelatedTests로 변경 파일과 관련된 테스트만 실행
  # --bail로 첫 실패 시 즉시 중단
  # --silent로 상세 로그 줄임
  pnpm --filter "$pkg" test --run --bail --silent --findRelatedTests $CHANGED_FILES 2>&1 || {
    echo "❌ 테스트 실패: $pkg"
    echo "변경 사항을 검토하거나 'pnpm --filter $pkg test --watch'로 디버깅하세요."
    exit 1
  }
done

echo "✅ 관련 테스트 모두 통과"
