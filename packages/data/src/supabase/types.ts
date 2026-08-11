/** db/migrations/20230715000000_init.sql 스키마와 1:1로 대응하는 로우 타입. */

export interface UserRow {
  id: string;
  name: string;
  role: string;
  ladder_group_id: string;
  ladder_order: number;
}

export interface GaugeRow {
  id: string;
  name: string;
  river: string;
  warn_level: number;
  alert_level: number;
  upstream_of: string[];
}

export interface SiteRow {
  id: string;
  name: string;
  type: "underpass" | "lowbridge" | "riverside_road";
  lat: number | null;
  lng: number | null;
  gauge_id: string;
  escalation_group_id: string;
}

export interface ReadingRow {
  id?: number;
  gauge_id: string;
  observed_at: string;
  level: number;
  source: "live" | "replay";
  interpolated: boolean;
}

export interface AlertRow {
  id: string;
  site_id: string;
  state: string;
  severity: string | null;
  created_at: string;
  trigger_level: number | null;
  lead_time_min: number | null;
  deadline_at: string | null;
}

export interface AssignmentRow {
  id?: string;
  alert_id: string;
  assignee_id: string;
  role: string;
  ladder_step: number;
  assigned_at: string;
  responded_at: string | null;
  deadline_at: string | null;
}

export interface EventRow {
  id: string;
  alert_id: string;
  from_state: string;
  to_state: string;
  actor_id: string | null;
  reason: string | null;
  occurred_at: string;
}

