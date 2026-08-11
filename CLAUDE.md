# 침수 취약지점 통제 이행 관리 시스템 (프로토타입)

충청북도 시·군 재난상황실용. 호우 시 지하차도·세월교·하상도로 등 침수 취약지점에 대해
수위 데이터로 통제 권고를 자동 생성하고, **승인 → 현장 배정 → 완료 확인**까지의 전 과정을
타이머로 강제하고 기록하는 시스템.

## 핵심 명제

자동화하는 것은 "판단"이 아니라 "누락"이다.

2023년 오송 궁평2지하차도 참사 당시 수위는 이미 경보 기준을 2m 초과한 상태였고
사고 90분 전 신고도 있었다. 부족했던 것은 예측이 아니라
**"아무도 아무것도 하지 않으면 자동으로 위로 올라가는 구조"**였다.

이 시스템은 통제 여부를 대신 판단하지 않는다. 사람이 판단하고 승인한다.
시스템이 하는 일은 오직 하나: 판단이 필요한 순간에 아무도 응답하지 않을 때
그 사실을 숨기지 않고, 정해진 시간 안에 다음 단계(상급자/차상위 담당)로 반드시
끌어올리는 것이다. 이 에스컬레이션 규칙과 그 기록이 이 시스템의 존재 이유다.

## 절대 제약 (위반 시 전체 재작업)

이 5개 제약은 협상 대상이 아니다. 어떤 단계, 어떤 기능을 구현하든 아래를 어기면
해당 코드는 전체 재작업 대상이다.

1. **`Date.now()` / `new Date()` 직접 호출 금지.**
   모든 시각은 주입된 `Clock` 인터페이스의 `now()`에서만 얻는다.
   도메인 코드, 테스트, 시드 리플레이 모두 예외 없음.

2. **`setTimeout` / `setInterval`을 도메인 로직에 사용 금지.**
   타이머(에스컬레이션, 마감 판정 등)는 가상 시각 기준 스케줄러로 구현한다.
   실제 시간 흐름과 무관하게, 배속을 올리거나 시각을 점프시켜도 동일하게 동작해야 한다.

3. **모든 상태 전이는 반드시 events 테이블(이벤트 로그)에 기록한다.**
   기록 없는 전이는 존재해서는 안 된다. UI에 보이는 모든 상태는 이벤트 로그에서
   재구성 가능해야 한다 (event sourcing에 가까운 원칙 — 상태는 이벤트의 결과일 뿐,
   별도로 몰래 바뀌지 않는다).

4. **도메인 로직은 데이터 출처(실시간 API / 리플레이 시드)를 알아서는 안 된다.**
   `GaugeSource` 인터페이스 뒤로 숨긴다. 도메인은 "수위 데이터가 어디서 왔는지"를
   묻지 않고 "지금 수위가 얼마인지"만 안다.

5. **결정론성.** 같은 시드 + 같은 배속 + 같은 조작 = 항상 같은 결과.
   랜덤 요소는 금지하거나(권장) 반드시 시드를 고정한다. 이는 곧 데모/시연에서
   재현 가능한 시나리오(오송 사고 재현 등)를 항상 동일하게 재생할 수 있어야 한다는 뜻.

### 위 제약에서 파생되는 설계 원칙

- **의존성 주입 / 합성 루트(composition root).** `Clock`, `GaugeSource`, 스케줄러,
  이벤트 저장소는 모두 인터페이스로 정의하고, 실제 구현체는 앱 진입점(합성 루트)에서
  주입한다. 도메인 코어는 이 구현체들의 존재만 알 뿐 내부를 모른다.
- **도메인 코어는 프레임워크 무지(framework-agnostic).** Next.js, Supabase 클라이언트,
  fetch 등은 도메인 패키지 안에 들어오지 않는다. Stage 1이 "UI 없음, 테스트만"인 이유.
- **상태는 이벤트의 파생물.** 테이블에 현재 상태 컬럼을 두더라도, 그 값은 이벤트 로그를
  replay해서 나온 결과와 항상 일치해야 한다 (검증 가능해야 함).

## 기술 스택

- 백엔드/도메인: TypeScript (Node)
- 프론트: Next.js (App Router)
- DB: Supabase (PostgreSQL)
- 테스트: vitest

## 개발 순서

1. **도메인 코어** — UI 없음, 테스트만. `Clock`, `GaugeSource`, 스케줄러, 이벤트 로그,
   통제 권고 생성, 승인/배정/완료 워크플로우와 에스컬레이션을 순수 TS로 구현하고
   vitest로 결정론성을 검증한다.
2. **데이터 계층 + 시드 로더** — Supabase 스키마/마이그레이션, 이벤트 로그 영속화,
   리플레이 시드(과거 사고 시나리오 등)로 `GaugeSource`를 구현한다.
3. **상황실 대시보드** — Next.js App Router. 침수 취약지점 현황, 통제 권고, 승인 대기,
   에스컬레이션 상태를 실시간(가상 시각 기준)으로 보여준다.
4. **현장 모바일 + 주민 알림 + 감사 로그** — 배정받은 현장 담당자용 화면, 주민 알림 발송,
   전체 이벤트 로그를 사람이 읽을 수 있는 감사 로그로 노출.
5. **실시간 API 연결** — `GaugeSource`의 실제 구현체를 실시간 수위 API로 교체.
   도메인 코어는 무수정.

## 용어 (추후 상세화)

- **Site**: 침수 취약지점 (지하차도/세월교/하상도로 등)
- **Gauge / Reading**: 지점에 연결된 수위 관측소 / 관측값
- **ControlOrder**: 통제 권고 → 승인 → 배정 → 완료로 이어지는 작업 단위
- **Escalation**: 정해진 시간 내 응답이 없을 때 자동으로 상급/차상위로 올라가는 전이
- **EventLog**: 모든 상태 전이의 append-only 기록. 상태의 유일한 출처(source of truth)

## 프로젝트 구조 제안 (아직 생성 안 함 — 승인 대기)

Stage 1이 "도메인 코어만 독립적으로 테스트"를 요구하므로, 도메인 코어가 Next.js/Supabase에
전혀 의존하지 않는 별도 패키지로 분리되는 워크스페이스 구조를 제안한다.

```
충북 공모전/
├── CLAUDE.md
├── package.json                 # workspaces 루트 (pnpm 또는 npm workspaces)
├── tsconfig.base.json
│
├── packages/
│   ├── domain/                  # Stage 1 — 프레임워크 무지, 순수 TS
│   │   ├── src/
│   │   │   ├── clock/            # Clock 인터페이스 (SystemClock, VirtualClock)
│   │   │   ├── scheduler/        # 가상 시각 기준 스케줄러 (에스컬레이션 타이머 대체)
│   │   │   ├── gauge/            # GaugeSource 인터페이스 (구현체는 packages/data에)
│   │   │   ├── events/           # 이벤트 타입 + append-only EventLog 인터페이스
│   │   │   ├── control/          # 수위 → 통제 권고 생성 로직
│   │   │   ├── workflow/         # 승인→배정→완료 상태기계 + 에스컬레이션 규칙
│   │   │   └── types/            # Site, Gauge, ControlOrder 등 공유 도메인 타입
│   │   └── test/                 # vitest — Stage 1은 이 폴더만으로 완결/검증
│   │
│   └── data/                    # Stage 2 — GaugeSource/EventLog의 실제 구현체
│       ├── src/
│       │   ├── supabase/         # Supabase 클라이언트, EventLog 영속화 구현
│       │   ├── gauge-sources/    # ReplaySeedGaugeSource, (Stage5) LiveGaugeSource
│       │   └── seed/             # 리플레이 시드 데이터 (오송 사고 재현 시나리오 등)
│       └── test/
│
├── db/
│   └── migrations/               # Supabase SQL 마이그레이션 (events 테이블 등)
│
└── apps/
    └── web/                      # Stage 3–4 — Next.js App Router
        ├── app/
        │   ├── (situation-room)/ # Stage 3: 상황실 대시보드
        │   ├── (field)/          # Stage 4: 현장 모바일
        │   └── (audit)/          # Stage 4: 감사 로그
        └── lib/
            └── composition-root.ts  # Clock/GaugeSource/EventLog 구현체 주입 지점
```

- `packages/domain`은 `packages/data`나 `apps/web`을 import하지 않는다 (단방향 의존).
- `apps/web`은 도메인 로직을 직접 구현하지 않고 `packages/domain` + `packages/data`를 조립만 한다.
- Stage 5에서 `packages/data/src/gauge-sources`에 `LiveGaugeSource`만 추가되며,
  `packages/domain`은 수정되지 않아야 한다 (제약 4의 검증 기준).
