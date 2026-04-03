import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://msmqgxtexgratpneaamu.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbXFneHRleGdyYXRwbmVhYW11Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQ0Mzc4MCwiZXhwIjoyMDg1MDE5NzgwfQ.GbI5H8VxhJC1_dkrnTmLJqn380GhYelkx7QNdh5nLIU';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Employee data from Excel: PTO Detail 4-1-26.xlsx
// Format: { name, first_name, last_name, middle_name, pto_balance, sick_balance }
const employees = [
  { last: 'ACEVEDO BARERA', first: 'FELIPE',   middle: '',  pto: 8.98,   sick: 40 },
  { last: 'ACEVEDO VELASQUEZ', first: 'ELKIN', middle: 'A', pto: -15.02, sick: 40 },
  { last: 'BONILLA',          first: 'SANDRA',  middle: '',  pto: -40,    sick: 24 },
  { last: 'CHALKER',          first: 'JESSE',   middle: 'W', pto: 48,     sick: 40 },
  { last: 'JI',               first: 'LIYUAN',  middle: '',  pto: 10.79,  sick: 40 },
  { last: 'KARSAI',           first: 'ARPAD',   middle: '',  pto: 9.96,   sick: 40 },
  { last: 'LE',               first: 'DOUGLAS', middle: 'A', pto: 9.13,   sick: 40 },
  { last: 'LEE',              first: 'SANGYONG',middle: '',  pto: 10.79,  sick: 40 },
  { last: 'LEI',              first: 'NICKY',   middle: '',  pto: -59.84, sick: 40 },
  { last: 'MONTANO',          first: 'SARBELIO',middle: '',  pto: -34.15, sick: 8  },
];

async function deleteAllEmployeeData() {
  console.log('--- Deleting all employee-related data ---');

  const tables = [
    'activity_logs',
    'tasks',
    'leave_history',
    'leave_requests',
    'disciplinary_actions',
    'disciplinary_incidents',
    'policy_acknowledgments',
    'worker_rate_history',
    'users',
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      // Some tables may not exist or may use a different id type — log and continue
      console.warn(`  [warn] ${table}: ${error.message}`);
    } else {
      console.log(`  [ok] Cleared table: ${table}`);
    }
  }
}

async function insertEmployees() {
  console.log('\n--- Inserting employees from Excel ---');

  const records = employees.map((emp, index) => {
    const workerId = `W-${String(index + 1).padStart(3, '0')}`;
    const fullName = `${emp.first} ${emp.middle ? emp.middle + ' ' : ''}${emp.last}`.trim();
    const username = `${emp.first.toLowerCase()}.${emp.last.toLowerCase().replace(/\s+/g, '')}`;

    return {
      worker_id:   workerId,
      username:    username,
      name:        fullName,
      first_name:  emp.first.charAt(0) + emp.first.slice(1).toLowerCase(),
      last_name:   emp.last.charAt(0) + emp.last.slice(1).toLowerCase(),
      middle_name: emp.middle || null,
      role:        'employee',
      hourly_rate: 0,
      active:      true,
      status:      'offline',
      pto_balance:  String(emp.pto),
      sick_balance: String(emp.sick),
      password:    'Welcome1!',
    };
  });

  const { data, error } = await supabase.from('users').insert(records).select();

  if (error) {
    console.error('  [error] Insert failed:', error.message);
    console.error('  Details:', error.details);
    return;
  }

  console.log(`  [ok] Inserted ${data.length} employees:`);
  data.forEach(u => {
    console.log(`    ${u.worker_id}  ${u.name.padEnd(35)} PTO: ${u.pto_balance} hrs  SICK: ${u.sick_balance} hrs`);
  });
}

async function main() {
  await deleteAllEmployeeData();
  await insertEmployees();
  console.log('\nDone.');
}

main().catch(console.error);
