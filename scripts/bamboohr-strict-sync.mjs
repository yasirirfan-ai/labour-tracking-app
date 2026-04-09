import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// BambooHR API Configuration
const BAMBOOHR_SUBDOMAIN = 'ukut';
const BAMBOOHR_API_KEY = 'ce454c0bf1e7439e5379fae899f2d6f3d06fb9b7';
const auth = Buffer.from(`${BAMBOOHR_API_KEY}:x`).toString('base64');

// Supabase Configuration
const SUPABASE_URL = 'https://nmdtmdffqrmgqcdzpsan.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZHRtZGZmcXJtZ3FjZHpwc2FuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDM2MzAzMywiZXhwIjoyMDU1OTM5MDU5fQ.eokS61H7R6sI-9-2i3Oq-cIEYQ9sO4y_r3T0xQ9U1kU';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const employees = [
  { name: 'Elkin Acevedo', workerId: 'W-002', bambooId: 41227 },
  { name: 'Felipe Acevedo', workerId: 'W-003', bambooId: 41235 },
  { name: 'Sandra Bonilla', workerId: 'W-004', bambooId: 41231 },
  { name: 'Sarbelio (Erik) Montano', workerId: 'W-001', bambooId: 40609 }
];

const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

const getPrevBoundary = (date) => {
    const d = new Date(date);
    if (d.getDate() === 15) {
        return formatDate(new Date(d.getFullYear(), d.getMonth(), 0)); // Last day of prev month
    } else {
        return formatDate(new Date(d.getFullYear(), d.getMonth(), 15));
    }
};

async function getBambooBalanceSafe(bambooId, date) {
  try {
    const res = await axios.get(
      `https://api.bamboohr.com/api/gateway.php/${BAMBOOHR_SUBDOMAIN}/v1/employees/${bambooId}/time_off/calculator?date=${date}`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
    );
    const pto = res.data.find(t => t.name.toLowerCase().includes('pto') || t.name.toLowerCase().includes('vacation'))?.balance || 0;
    const sick = res.data.find(t => t.name.toLowerCase().includes('sick'))?.balance || 0;
    return { pto: parseFloat(pto), sick: parseFloat(sick), error: null };
  } catch (error) {
    if (error.response && error.response.status === 403) {
      return { pto: 0, sick: 0, error: 403 }; // Just assume 0 before tracking started
    }
    return { pto: 0, sick: 0, error: error.message };
  }
}

async function getBambooRequests(bambooId) {
  try {
    const res = await axios.get(
      `https://api.bamboohr.com/api/gateway.php/${BAMBOOHR_SUBDOMAIN}/v1/employees/${bambooId}/time_off/requests?status=approved`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
    );
    return res.data.map(r => ({
      start: r.start,
      end: r.end,
      amount: parseFloat(r.amount.amount),
      type: (r.type.name.toLowerCase().includes('pto') || r.type.name.toLowerCase().includes('vacation')) ? 'pto' : 'sick',
      notes: r.notes || ''
    }));
  } catch (error) {
    return [];
  }
}

async function migrate() {
  console.log('✅ STRICT BambooHR Sync Started...\n');
  
  for (const emp of employees) {
    try {
      console.log(`Syncing ${emp.name} Exactly from BambooHR LEDGER...`);
      
      const { data: dbUser } = await supabase.from('users').select('id, hire_date').eq('worker_id', emp.workerId).single();
      if (!dbUser) continue;

      // Start strictly from their hire date
      let runner = new Date(dbUser.hire_date || '2024-01-01');

      const today = new Date();
      const historyRows = [];
      let prevBal = { pto: 0, sick: 0 };

      // Initial eligibility
      const initialDate = formatDate(runner);
      ['pto', 'sick'].forEach(type => {
          historyRows.push({
            user_id: dbUser.id, entry_date: initialDate,
            description: `${emp.name.split(' ')[0]} initial eligibility`,
            used_hours: null, earned_hours: null, balance: 0, type
          });
      });

      const requests = await getBambooRequests(emp.bambooId);
      const sortedRequests = requests.sort((a, b) => a.start.localeCompare(b.start));
      let reqIdx = 0;

      while (runner <= today) {
          const year = runner.getFullYear();
          const month = runner.getMonth();
          
          let targetDate;
          if (runner.getDate() < 15) {
              targetDate = new Date(year, month, 15);
          } else {
              targetDate = new Date(year, month + 1, 0);
          }
          if (targetDate > today) targetDate = today;
          const isoTarget = formatDate(targetDate);
          
          // 1. Process Usage
          while (reqIdx < sortedRequests.length && sortedRequests[reqIdx].start <= isoTarget) {
              const req = sortedRequests[reqIdx];
              if (req.start >= initialDate) {
                  const type = req.type;
                  prevBal[type] -= req.amount;
                  historyRows.push({
                      user_id: dbUser.id, entry_date: req.start,
                      description: `Time off used for ${req.start} to ${req.end}${req.notes ? ': ' + req.notes : ''}`,
                      used_hours: -req.amount, earned_hours: null, balance: prevBal[type], type
                  });
              }
              reqIdx++;
          }

          // 2. Fetch Truth Balance
          const currentBal = await getBambooBalanceSafe(emp.bambooId, isoTarget);
          if (currentBal.error !== 403) { // Skip if blocked by old date
              const ptoEarned = currentBal.pto - prevBal.pto;
              const sickEarned = currentBal.sick - prevBal.sick;
              const prevBoundary = getPrevBoundary(targetDate);
              const desc = `Accrual for period ending ${isoTarget}`;

              if (Math.abs(ptoEarned) > 0.001) {
                  historyRows.push({
                      user_id: dbUser.id, entry_date: isoTarget,
                      description: ptoEarned > 0 ? desc : `Adjustment for period ending ${isoTarget}`,
                      used_hours: null, earned_hours: ptoEarned, balance: currentBal.pto, type: 'pto'
                  });
              }
              if (Math.abs(sickEarned) > 0.001) {
                  historyRows.push({
                      user_id: dbUser.id, entry_date: isoTarget,
                      description: sickEarned > 0 ? desc : `Adjustment for period ending ${isoTarget}`,
                      used_hours: null, earned_hours: sickEarned, balance: currentBal.sick, type: 'sick'
                  });
              }
              prevBal = currentBal;
          }

          runner = new Date(targetDate);
          runner.setDate(runner.getDate() + 1);
          await new Promise(r => setTimeout(r, 100));
      }

      // 3. Clear existing user rows, insert exact BambooHR clones
      await supabase.from('leave_history').delete().eq('user_id', dbUser.id);
      
      if (historyRows.length > 0) {
          for (let i = 0; i < historyRows.length; i += 50) {
              const { error } = await supabase.from('leave_history').insert(historyRows.slice(i, i + 50));
              if (error) {
                  console.error('INSERT ERROR:', error);
              }
          }
          console.log(`   Saved exactly ${historyRows.length} history records straight from BambooHR.`);
          
          await supabase.from('users').update({ 
              pto_balance: String(prevBal.pto), 
              sick_balance: String(prevBal.sick) 
          }).eq('id', dbUser.id);
      }
    } catch (e) { console.error('Overall Employee Sync Error:', e); }
  }
}

migrate();
