import { createClient } from '@supabase/supabase-js';
import type { Task, User, ManufacturingOrder, DisciplinaryPolicy, DisciplinaryIncident, DisciplinaryAction, PolicyAcknowledgment } from '../types';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id'>;
        Update: Partial<Omit<User, 'id'>>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, 'id' | 'created_at'>;
        Update: Partial<Omit<Task, 'id' | 'created_at'>>;
      };
      manufacturing_orders: {
        Row: ManufacturingOrder;
        Insert: Omit<ManufacturingOrder, 'id' | 'created_at'>;
        Update: Partial<Omit<ManufacturingOrder, 'id' | 'created_at'>>;
      };
      operations: {
        Row: any;
        Insert: any;
        Update: any;
      };
      disciplinary_policies: {
        Row: DisciplinaryPolicy;
        Insert: Omit<DisciplinaryPolicy, 'id' | 'created_at'>;
        Update: Partial<Omit<DisciplinaryPolicy, 'id' | 'created_at'>>;
      };
      disciplinary_incidents: {
        Row: DisciplinaryIncident;
        Insert: Omit<DisciplinaryIncident, 'id' | 'created_at'> & { documentation?: string; attachment_url?: string };
        Update: Partial<Omit<DisciplinaryIncident, 'id' | 'created_at'>> & { documentation?: string; attachment_url?: string };
      };
      disciplinary_actions: {
        Row: DisciplinaryAction;
        Insert: Omit<DisciplinaryAction, 'id' | 'created_at'>;
        Update: Partial<Omit<DisciplinaryAction, 'id' | 'created_at'>>;
      };
      policy_acknowledgments: {
        Row: PolicyAcknowledgment;
        Insert: Omit<PolicyAcknowledgment, 'id'>;
        Update: Partial<Omit<PolicyAcknowledgment, 'id'>>;
      };
      appeal_cases: {
        Row: any; // Keeping any for appeal cases until the interface is more certain
        Insert: any;
        Update: any;
      };
    };
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
