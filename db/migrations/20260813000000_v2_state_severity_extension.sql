-- v2 사양(상태기계 교체)에 따른 CHECK 제약 확장.
-- 기존 마이그레이션(20230715000000_init.sql)은 수정하지 않는다.
--
-- 값 추가(add)는 안전하지만 제거(drop)는 그 값을 쓰는 기존 행을 깨뜨릴 수 있어 되돌리기
-- 어렵다. 그래서 옛 값(APPROVED, WATCH, ALERT, SEVERE)은 지우지 않고 남겨둔다 — 도메인
-- 코드가 더 이상 그 값을 쓰지 않으면 그걸로 충분하다. 실제로 컬럼에서 옛 값을 제거하는 건
-- 별도의, 데이터 이관을 동반하는 신중한 마이그레이션으로 다룬다.

alter table alerts drop constraint if exists alerts_state_check;
alter table alerts add constraint alerts_state_check check (
  state in (
    'MONITORING', 'RECOMMENDED', 'APPROVED', 'DIRECTED', 'CONTROLLED',
    'RELEASE_PENDING', 'REJECTED', 'FORCED'
  )
);

alter table alerts drop constraint if exists alerts_severity_check;
alter table alerts add constraint alerts_severity_check check (
  severity in (
    'WATCH', 'ALERT', 'SEVERE', 'WARN', 'DESIGN_FLOOD', 'INUNDATION'
  )
);
