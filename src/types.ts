export interface Message {
  id: number;
  channel: string;
  sender_name: string;
  sender_id: number;
  content: string;
  timestamp: string;
  is_ai: number;
}

export interface Channel {
  id: string;
  name: string;
  icon: string;
  type: 'messenger' | 'social' | 'email' | 'ai';
}
