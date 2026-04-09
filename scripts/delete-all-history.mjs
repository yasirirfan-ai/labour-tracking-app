import axios from 'axios';

const SUPABASE_URL = 'https://msmqgxtexgratpneaamu.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbXFneHRleGdyYXRwbmVhYW11Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQ0Mzc4MCwiZXhwIjoyMDg1MDE5NzgwfQ.GbI5H8VxhJC1_dkrnTmLJqn380GhYelkx7QNdh5nLIU';

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal'
};

try {
  // Delete ALL rows from leave_history
  const res = await axios.delete(
    `${SUPABASE_URL}/rest/v1/leave_history?id=neq.00000000-0000-0000-0000-000000000000`,
    { headers }
  );
  console.log('✅ All leave_history records deleted! Status:', res.status);

  // Verify count
  const countRes = await axios.get(
    `${SUPABASE_URL}/rest/v1/leave_history?select=id`,
    { headers: { ...headers, Prefer: 'count=exact' } }
  );
  console.log('Remaining rows:', countRes.headers['content-range']);
} catch (err) {
  console.error('❌ Error:', err.response?.data || err.message);
}
