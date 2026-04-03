import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://msmqgxtexgratpneaamu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbXFneHRleGdyYXRwbmVhYW11Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQ0Mzc4MCwiZXhwIjoyMDg1MDE5NzgwfQ.GbI5H8VxhJC1_dkrnTmLJqn380GhYelkx7QNdh5nLIU'
);

const { data, error } = await supabase.from('users').insert({
  worker_id:   'ADMIN',
  username:    'admin@gmail.com',
  name:        'Admin',
  first_name:  'Admin',
  last_name:   '',
  role:        'manager',
  hourly_rate: 0,
  active:      true,
  status:      'offline',
  password:    'admin123',
}).select().single();

if (error) {
  console.error('Error:', error.message, error.details);
} else {
  console.log('Admin user created successfully!');
  console.log('  Username:', data.username);
  console.log('  Password: admin123');
  console.log('  Role:    ', data.role);
  console.log('  ID:      ', data.id);
}
