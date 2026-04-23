---
name: test-watch
description: Run tests automatically for changed files. Use this skill when the user wants to run tests in watch mode for backend, frontend, or both, or when they ask to verify recent changes.
allowed-tools: Bash
---

# Test Watch

변경된 파일과 관련된 테스트를 자동 실행합니다.

## 사용법

```
/test-watch          # 자동 감지 (backend or frontend)
/test-watch backend  # 백엔드만
/test-watch frontend # 프런트엔드만
/test-watch all      # 전체
```

## 동작

1. `$ARGUMENTS`로 받은 인자를 파싱:
   - 비어있음: git에서 변경된 파일을 보고 affected package 자동 감지
   - `backend`: `pnpm --filter backend test --watch`
   - `frontend`: `pnpm --filter frontend test --watch`
   - `all`: `pnpm test --watch`

2. 자동 감지 로직:
   ```bash
   CHANGED=$(git diff --name-only HEAD)
   if echo "$CHANGED" | grep -q "^apps/backend/"; then
     pnpm --filter backend test --watch
   elif echo "$CHANGED" | grep -q "^apps/frontend/"; then
     pnpm --filter frontend test --watch
   else
     pnpm test --watch
   fi
   ```

3. watch 모드는 인터랙티브이므로 사용자에게 종료 방법(Ctrl+C) 안내

## 주의

- watch 모드는 백그라운드 실행 X — 포그라운드에서 사용자가 직접 종료
- CI나 pre-push에서는 `--run` 플래그 사용 (다른 skill)
