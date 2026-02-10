export interface User {
  id: string;
  display_name: string;
  total_points: number;
  total_minutes: number;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  is_active: boolean;
  max_members: number;
  created_at: string;
}

export interface RoomMember {
  user_id: string;
  display_name: string;
  status: 'studying' | 'away';
  studying_minutes: number;
  joined_at: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  room_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  points_earned: number;
}
