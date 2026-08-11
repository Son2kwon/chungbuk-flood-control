# 침수 취약지점 통제 이행 관리 시스템 (프로토타입)

충청북도 시·군 재난상황실용. 호우 시 지하차도·세월교·하상도로 등 침수 취약지점에 대해
수위 데이터로 통제 권고를 자동 생성하고, **승인 → 현장 배정 → 완료 확인**까지의 전 과정을
타이머로 강제하고 기록하는 시스템.

자세한 설계 원칙과 절대 제약은 [CLAUDE.md](./CLAUDE.md)를 참고한다.

## 구조

```
packages/domain   프레임워크 무지 도메인 코어 (Clock, GaugeSource, 상태기계, 이벤트 로그)
packages/data     Supabase 스키마 연동 + 로컬 리플레이 시드 (오송 궁평2지하차도 사고 재현)
db/migrations     Supabase SQL 마이그레이션
apps/web          Next.js App Router 대시보드
```

## 로컬 실행

```bash
npm install
npm run dev:web
```

http://localhost:3000 을 연다. 상단 네비게이션으로 상황실(`/`) · 현장(`/field`) ·
주민 알림(`/notify`) · 감사 로그(`/audit`) · 비교(`/compare`) 화면을 오간다.

## 테스트

```bash
npm run test:domain
npm run test:data
```

## 배포 (Vercel)

이 저장소는 npm workspaces 모노레포다. Vercel 프로젝트 설정에서 **Root Directory를
`apps/web`로 지정**해야 한다 — 그러면 Vercel이 Next.js를 자동 인식하고, 워크스페이스
패키지(`@chungbuk/domain`, `@chungbuk/data`)는 리포 루트에서 `npm install`이 함께 설치한다.

## 참고

- 이 프로토타입은 실제 Supabase 프로젝트에 연결되어 있지 않다. `packages/data`의
  Supabase 연동 코드는 스키마/타입만 구현되어 있고, 시드 로더는 `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY` 환경변수가 있어야 동작한다 (`.env.local`, 커밋 금지).
- 대시보드가 쓰는 데이터는 100% 로컬 번들 시드(`packages/data/src/seed`)다 — 네트워크
  없이 동작하며, Supabase 유무와 무관하게 동일하게 재현된다.
