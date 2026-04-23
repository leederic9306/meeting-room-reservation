#!/usr/bin/env bash
# =============================================================================
# Branch Check Hook
# =============================================================================
# develop, main 브랜치에서 직접 작업하는 것을 경고합니다.
# =============================================================================

set -e

# Git repo가 아니면 무시
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  exit 0
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "develop" ]; then
  echo ""
  echo "⚠️  현재 보호 브랜치($CURRENT_BRANCH)에 있습니다."
  echo "    feature 브랜치를 생성하는 것을 권장합니다:"
  echo ""
  echo "    git checkout -b feature/p<phase>-<영문-요약>"
  echo ""
fi

exit 0
