# 로컬 개발 환경 (Docker)

## 빠른 시작

```bash
# 1. 환경변수 파일 준비
cp .env.example .env

# 2. 인프라 기동 (PostgreSQL + MailHog)
docker compose up -d

# 3. DB GUI도 함께 띄우려면 (Adminer)
docker compose --profile tools up -d

# 4. 상태 확인
docker compose ps

# 5. 종료
docker compose down

# 6. 종료 + DB 데이터 완전 초기화
docker compose down -v
```

## 서비스별 접속 정보

| 서비스 | URL / 포트 | 용도 |
|---|---|---|
| PostgreSQL | `localhost:5432` | DB |
| MailHog SMTP | `localhost:1025` | 이메일 발송 (앱이 사용) |
| MailHog Web UI | http://localhost:8025 | 발송된 이메일 확인 |
| Adminer (선택) | http://localhost:8081 | DB GUI |

## DB 접속 정보 (기본값)

```
Host:     localhost
Port:     5432
Database: meetingroom_dev
User:     meetingroom
Password: meetingroom_dev_pw
```

연결 문자열:
```
postgresql://meetingroom:meetingroom_dev_pw@localhost:5432/meetingroom_dev?schema=public
```

## MailHog 사용법

1. 애플리케이션이 `localhost:1025`로 SMTP 발송
2. 인증 없이 모든 메일 수신
3. http://localhost:8025 에서 받은 메일 확인
4. 외부로는 절대 발송되지 않음 (안전)

## 트러블슈팅

### 포트 충돌

다른 PostgreSQL이 이미 5432를 사용 중이면 `.env`에서 `POSTGRES_PORT=5433` 등으로 변경.

### DB 초기화

```bash
docker compose down -v       # 볼륨까지 삭제
docker compose up -d         # 재기동
pnpm --filter backend prisma migrate dev    # 마이그레이션 재실행
pnpm --filter backend prisma db seed        # 시드 데이터 재생성
```

### btree_gist 확장 확인

```bash
docker exec -it meeting-room-postgres psql -U meetingroom -d meetingroom_dev \
  -c "SELECT extname FROM pg_extension WHERE extname = 'btree_gist';"
```

`btree_gist` 1행이 나오면 정상.

### 컨테이너 로그 확인

```bash
docker compose logs -f postgres
docker compose logs -f mailhog
```

## 디렉토리 구조

```
docker/
└── postgres/
    └── init/
        └── 01-extensions.sql   # 컨테이너 최초 기동 시 자동 실행
```

`init/` 하위 SQL/SH 파일은 알파벳 순으로 1회만 실행됩니다 (PGDATA 볼륨이 비어있을 때만).
