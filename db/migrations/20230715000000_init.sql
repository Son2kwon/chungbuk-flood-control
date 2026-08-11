-- Stage 2: 초기 스키마.
-- 설계 원칙: events(이벤트 로그)는 이 시스템의 유일한 source of truth다.
-- alerts/assignments는 그 이벤트 로그를 replay해서 나온 "현재 상태" 투영(projection)일 뿐이므로,
-- events/assignments에서 alerts로의 외래키를 걸지 않는다 — 투영 테이블이 아직 없거나 지워졌다고
-- 로그 자체의 append가 막혀서는 안 되기 때문이다 (CLAUDE.md 제약 3, 상태는 이벤트의 파생물).

create extension if not exists pgcrypto;

-- 사용자 / 에스컬레이션 사다리 (담당자 → 부서장 → 상황실장 등, ladder_group_id로 그룹핑)
create table users (
  id text primary key,
  name text not null,
  role text not null,
  ladder_group_id text not null,
  ladder_order integer not null,
  unique (ladder_group_id, ladder_order)
);

-- 수위 관측소
create table gauges (
  id text primary key,
  name text not null,
  river text not null,
  warn_level numeric not null,
  alert_level numeric not null,
  -- 이 관측소보다 하류에 있는(= 이 관측소가 상류인) 관측소 id 목록
  upstream_of text[] not null default '{}'
);

-- 침수 취약지점
create table sites (
  id text primary key,
  name text not null,
  type text not null check (type in ('underpass', 'lowbridge', 'riverside_road')),
  lat numeric,
  lng numeric,
  gauge_id text not null references gauges (id),
  escalation_group_id text not null
);

-- 수위 관측값 (원본 관측점만 저장한다. 관측점 사이 보간은 GaugeSource가 조회 시점에 계산하며
-- DB에는 보간값을 저장하지 않는다 — 저장된 행은 항상 interpolated = false)
create table readings (
  id bigint generated always as identity primary key,
  gauge_id text not null references gauges (id),
  observed_at timestamptz not null,
  level numeric not null,
  source text not null check (source in ('live', 'replay')),
  interpolated boolean not null default false,
  unique (gauge_id, observed_at, source)
);
create index readings_gauge_id_observed_at_idx on readings (gauge_id, observed_at);

-- 통제 권고 → 승인 → 배정 → 완료로 이어지는 작업 단위 (events를 replay한 현재 상태 투영)
create table alerts (
  id text primary key,
  site_id text not null references sites (id),
  state text not null check (
    state in ('MONITORING', 'RECOMMENDED', 'APPROVED', 'CONTROLLED', 'RELEASE_PENDING', 'REJECTED', 'FORCED')
  ),
  severity text check (severity in ('WATCH', 'ALERT', 'SEVERE')),
  created_at timestamptz not null,
  trigger_level numeric,
  lead_time_min integer,
  deadline_at timestamptz
);

-- 담당자 배정 이력 (사다리 단계별 배정 투영)
create table assignments (
  id uuid primary key default gen_random_uuid(),
  alert_id text not null,
  assignee_id text not null references users (id),
  role text not null,
  ladder_step integer not null,
  assigned_at timestamptz not null,
  responded_at timestamptz,
  deadline_at timestamptz
);
create index assignments_alert_id_idx on assignments (alert_id);

-- append-only 이벤트 로그. 상태의 유일한 출처.
create table events (
  id text primary key,
  alert_id text not null,
  from_state text not null,
  to_state text not null,
  actor_id text,
  reason text,
  occurred_at timestamptz not null
);
create index events_alert_id_occurred_at_idx on events (alert_id, occurred_at);
