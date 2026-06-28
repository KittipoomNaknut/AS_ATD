export type CheckInStatus = 'present' | 'late';
export type SeatStatus = 'absent' | 'present' | 'late' | 'flagged';

export interface Student {
  student_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  major: string;
  section: string;
  is_active: boolean;
}

export interface Session {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  lat: number;
  lng: number;
  radius_meters: number;
  late_after_minutes: number;
}

export interface CheckIn {
  session_id: string;
  student_id: string;
  checked_at: string;
  status: CheckInStatus;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
  device_hash: string | null;
}

export interface CheckInAttempt {
  id: string;
  session_id: string;
  student_id: string | null;
  attempted_at: string;
  reason: string;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
}

export type CheckinErrorCode =
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'NONCE_REUSED'
  | 'STUDENT_NOT_FOUND'
  | 'STUDENT_INACTIVE'
  | 'ALREADY_CHECKED_IN'
  | 'OUT_OF_GEOFENCE'
  | 'NO_LOCATION'
  | 'SESSION_CLOSED'
  | 'CONCURRENT_SESSION'
  | 'INTERNAL_ERROR';
