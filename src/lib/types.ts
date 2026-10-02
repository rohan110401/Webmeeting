export type SessionStatus = "scheduled" | "live" | "ended" | "cancelled";

export interface SessionListItem {
  id: string;
  title: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: SessionStatus;
  join_opens_at: string;
  join_closes_at: string;
  other_name: string | null;
  has_my_note: boolean;
}

export interface Participant {
  user_id: string;
  display_name: string;
  is_me: boolean;
}

export interface SessionDetails {
  id: string;
  pair_id: string;
  title: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  created_by_me: boolean;
  join_opens_at: string;
  join_closes_at: string;
  participants: Participant[];
}

export interface Pair {
  id: string;
  label: string | null;
  member_count: number;
  other_name: string | null;
}

export interface Profile {
  id: string;
  display_name: string;
  timezone: string;
}

export interface Note {
  content: string;
  version: number;
  updated_at: string | null;
}

export interface SavedNote {
  version: number;
  updated_at: string;
}

export interface VideoToken {
  serverUrl: string;
  token: string;
  e2eeKey: string;
  identity: string;
  closesAt: string;
}
