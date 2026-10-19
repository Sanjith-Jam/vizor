export interface UserProfile {
  id: string;
  email: string;
  name: string;
}

export interface SosContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  created_at: string;
}

export type HudTab = 'nav' | 'hazard' | 'sos' | 'map';
