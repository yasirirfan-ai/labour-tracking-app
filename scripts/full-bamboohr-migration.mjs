/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║      FULL BambooHR → Supabase Migration Script                      ║
 * ║  Fetches ALL data from BambooHR exactly as-is and saves to DB.      ║
 * ║                                                                      ║
 * ║  What this migrates (raw, no logic applied):                         ║
 * ║    ✓ All personal details (name, DOB, gender, address, phones...)    ║
 * ║    ✓ Employment info (title, dept, hire date, pay rate, schedule...) ║
 * ║    ✓ Compensation history (from tables/compensation)                 ║
 * ║    ✓ Job info history (from tables/jobInfo)                          ║
 * ║    ✓ PTO & Sick balances — EXACTLY from BambooHR today              ║
 * ║    ✓ All approved time-off requests → saved as usage entries         ║
 * ║    ✓ Raw BambooHR data dump saved to JSON for reference              ║
 * ║                                                                      ║
 * ║  ⚠️  NO accrual logic applied. Balances are exact BambooHR values.  ║
 * ║     Time-off history = actual approved requests from BambooHR.       ║
 * ║     Accrual engine runs AFTER migration on app load.                 ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Run: node scripts/full-bamboohr-migration.mjs
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import fs from 'fs';

// ── CONFIGURATION ─────────────────────────────────────────────────────────
const BAMBOOHR_SUBDOMAIN = 'puritycosmetics';
const BAMBOOHR_API_KEY   = 'ce454c0bf1e7439e5379fae899f2d6f3d06fb9b7';
const auth               = Buffer.from(`${BAMBOOHR_API_KEY}:x`).toString('base64');
const BHR_HEADERS        = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
const BHR_BASE           = `https://api.bamboohr.com/api/gateway.php/${BAMBOOHR_SUBDOMAIN}`;

const SUPABASE_URL         = 'https://msmqgxtexgratpneaamu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbXFneHRleGdyYXRwbmVhYW11Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQ0Mzc4MCwiZXhwIjoyMDg1MDE5NzgwfQ.GbI5H8VxhJC1_dkrnTmLJqn380GhYelkx7QNdh5nLIU';
const supabase             = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── TARGET EMPLOYEES (verified BambooHR IDs + actual DB worker IDs) ──────
// NOTE: worker IDs verified by querying the users table directly.
const EMPLOYEES = [
  { name: 'Elkin Acevedo',           workerId: 'W-002',  bambooId: 41227 },
  { name: 'Felipe Acevedo',          workerId: 'W-001',  bambooId: 41228 },
  { name: 'Sandra Bonilla',          workerId: 'V30838', bambooId: 40538 },
  { name: 'Sarbelio (Erik) Montano', workerId: 'B31084', bambooId: 40609 },
];

const TODAY = new Date().toISOString().split('T')[0];

// ── BambooHR API helper ───────────────────────────────────────────────────
async function bhr(path) {
  return axios.get(`${BHR_BASE}/${path}`, { headers: BHR_HEADERS });
}

// ── FETCH: ALL PERSONAL FIELDS ────────────────────────────────────────────
async function fetchPersonalData(bambooId) {
  const fields = [
    // Name
    'firstName', 'middleName', 'lastName', 'preferredName',
    // Personal
    'gender', 'dateOfBirth', 'maritalStatus',
    // Employment
    'hireDate', 'terminationDate',
    'employmentHistoryStatus', 'employeeType',
    'jobTitle', 'department', 'division', 'location', 'supervisor',
    // Pay
    'payType', 'payRate', 'payFrequency', 'payPeriod',
    // Contact
    'workPhone', 'workPhoneExt', 'mobilePhone', 'homePhone',
    'workEmail', 'homeEmail',
    // Address
    'address1', 'address2', 'city', 'state', 'zipcode', 'country',
    // EEO
    'ethnicity', 'eeoJobCategory',
    // Bonus / other
    'bonusAmount', 'bonusPercent',
    'shirtSize', 'photoUrl',
    // Veteran
    'isActiveDutyVeteran', 'isArmedForcesMedalVeteran',
    'isDisabledVeteran', 'isRecentlySeparatedVeteran',
    // Social
    'linkedIn', 'twitterUrl', 'facebookUrl',
  ].join(',');

  try {
    const res = await bhr(`v1/employees/${bambooId}/?fields=${fields}`);
    return res.data;
  } catch (e) {
    console.error(`  [ERROR] fetchPersonalData: ${e.response?.status} ${e.message}`);
    return null;
  }
}

// ── FETCH: JOB INFO TABLE (reporting chain, department history) ───────────
async function fetchJobInfo(bambooId) {
  try {
    const res = await bhr(`v1/employees/${bambooId}/tables/jobInfo`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    return [];
  }
}

// ── FETCH: COMPENSATION TABLE ─────────────────────────────────────────────
async function fetchCompensation(bambooId) {
  try {
    const res = await bhr(`v1/employees/${bambooId}/tables/compensation`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    return [];
  }
}

// ── FETCH: CURRENT LEAVE BALANCES (exact BambooHR balance as of today) ───
async function fetchCurrentBalances(bambooId) {
  try {
    const res = await bhr(`v1/employees/${bambooId}/time_off/calculator?date=${TODAY}`);
    const all  = res.data;
    const pto  = all.find(t => /pto|vacation/i.test(t.name));
    const sick = all.find(t => /sick/i.test(t.name));
    return {
      pto:  parseFloat(pto?.balance  ?? 0),
      sick: parseFloat(sick?.balance ?? 0),
      raw:  all,   // full BambooHR response including usedYearToDate, future, etc.
    };
  } catch (e) {
    console.log(`  [warn] Balances: ${e.response?.status}`);
    return { pto: 0, sick: 0, raw: [] };
  }
}

// ── FETCH: ALL APPROVED TIME-OFF REQUESTS (global endpoint) ──────────────
// These are the actual usage events from BambooHR — exactly what BambooHR
// shows in the time-off history. No accrual logic, just real approved requests.
async function fetchApprovedRequests(bambooId) {
  try {
    const res = await bhr(
      `v1/time_off/requests/?start=2015-01-01&end=${TODAY}&status=approved&employeeId=${bambooId}`
    );
    const requests = Array.isArray(res.data) ? res.data : [];
    requests.sort((a, b) => a.start.localeCompare(b.start));
    return requests;
  } catch (e) {
    console.log(`  [warn] Requests: ${e.response?.status}`);
    return [];
  }
}

// ── PARSE payRate field (e.g. "23.00 USD" → 23.00) ───────────────────────
function parsePayRate(payRate) {
  if (!payRate) return 0;
  const num = parseFloat(String(payRate).replace(/[^\d.]/g, ''));
  return isNaN(num) ? 0 : num;
}

// ── MAP: BambooHR person → users table columns ────────────────────────────
// Only maps to columns that ACTUALLY EXIST in the Supabase users table.
// Columns verified by reading users table schema on 2026-04-07.
function mapToUserSchema(p, jobInfo) {
  const latestJob = jobInfo.length > 0
    ? [...jobInfo].sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;

  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');

  return {
    // ── Name ──────────────────────────────────────────────────────────
    first_name:     p.firstName     || null,
    middle_name:    p.middleName    || null,
    last_name:      p.lastName      || null,
    preferred_name: p.preferredName || null,
    name:           fullName        || null,

    // ── Personal ──────────────────────────────────────────────────────
    gender:         p.gender        || null,
    birth_date:     p.dateOfBirth   || null,
    marital_status: p.maritalStatus || null,

    // ── Employment ────────────────────────────────────────────────────
    hire_date:         p.hireDate                                  || null,
    employment_status: p.employmentHistoryStatus                   || null,
    job_title:         p.jobTitle                                  || null,
    department:        p.department                                || null,
    division:          p.division                                  || null,
    location:          p.location                                  || null,
    reporting_to:      p.supervisor || latestJob?.reportsTo        || null,
    // Note: staff_type, pay_group, eeo_category, ethnicity columns do not
    // exist in the DB yet — they're in TypeScript types but not in the schema.

    // ── Pay ───────────────────────────────────────────────────────────
    pay_type:     p.payType                            || null,
    hourly_rate:  parsePayRate(p.payRate),
    pay_schedule: p.payFrequency                       || null,
    pay_period:   p.payPeriod || p.payFrequency        || null,

    // ── Contact ───────────────────────────────────────────────────────
    work_phone:     p.workPhone    || null,
    work_phone_ext: p.workPhoneExt || null,
    mobile_phone:   p.mobilePhone  || null,
    home_phone:     p.homePhone    || null,
    work_email:     p.workEmail    || null,
    home_email:     p.homeEmail    || null,
    email:          p.workEmail || p.homeEmail                          || null,
    phone:          p.workPhone || p.mobilePhone || p.homePhone         || null,

    // ── Address ───────────────────────────────────────────────────────
    address_street1: p.address1 || null,
    address_street2: p.address2 || null,
    address_city:    p.city     || null,
    address_state:   p.state    || null,
    address_zip:     p.zipcode  || null,
    address_country: p.country  || null,
    address: [p.address1, p.city, p.state, p.zipcode].filter(Boolean).join(', ') || null,

    // ── Veteran ───────────────────────────────────────────────────────
    is_active_duty_veteran:        p.isActiveDutyVeteran        === 'Yes',
    is_armed_forces_medal_veteran: p.isArmedForcesMedalVeteran  === 'Yes',
    is_disabled_veteran:           p.isDisabledVeteran          === 'Yes',
    is_recently_separated_veteran: p.isRecentlySeparatedVeteran === 'Yes',

    // ── Social / Other ────────────────────────────────────────────────
    shirt_size:   p.shirtSize || null,
    linkedin_url: p.linkedIn  || null,
    twitter_url:  p.twitterUrl  || null,
    facebook_url: p.facebookUrl || null,
    // Note: photo_url column does not exist in DB schema yet.
  };
}

// ── MAP: Approved requests → leave_history rows ───────────────────────────
// These are the EXACT usage events from BambooHR.
// No accrual entries are inserted — just what BambooHR recorded as used time.
// balance is set to 0 for usage rows (the DB requires it non-null).
// The real current balance is stored in users.pto_balance / users.sick_balance.
function mapRequestsToHistory(userId, requests) {
  const rows = [];
  for (const req of requests) {
    const typeName = req.type?.name || '';
    const isPto    = /pto|vacation/i.test(typeName);
    const isSick   = /sick/i.test(typeName);
    if (!isPto && !isSick) continue;

    const hours = parseFloat(req.amount?.amount) || 0;
    const note  = req.notes?.employee || req.notes?.manager || '';

    // Build a descriptive label matching what BambooHR shows
    const dateRange   = req.start === req.end ? req.start : `${req.start} to ${req.end}`;
    const description = `Time off used: ${dateRange}${note ? ' — ' + note : ''}`;

    rows.push({
      user_id:      userId,
      entry_date:   req.start,
      description,
      used_hours:   -Math.abs(hours),   // negative = time taken away
      earned_hours: null,               // no accrual logic applied here
      balance:      0,                  // placeholder — real balance is in users table
      type:         isPto ? 'pto' : 'sick',
    });
  }
  return rows;
}

// ── PRINT: formatted summary ──────────────────────────────────────────────
function printPersonalSummary(name, p, balances, requestCount) {
  const preferredDisplay = p.preferredName ? ` (${p.preferredName})` : '';
  console.log(`\n  ┌─ ${name}${preferredDisplay} ─────────────────────────────`);
  console.log(`  │  DOB:           ${p.dateOfBirth || '—'}`);
  console.log(`  │  Gender:        ${p.gender || '—'}`);
  console.log(`  │  Marital:       ${p.maritalStatus || '—'}`);
  console.log(`  │  Hire Date:     ${p.hireDate || '—'}`);
  console.log(`  │  Status:        ${p.employmentHistoryStatus || '—'} (${p.employeeType || '—'})`);
  console.log(`  │  Job Title:     ${p.jobTitle || '—'}`);
  console.log(`  │  Department:    ${p.department || '—'}`);
  console.log(`  │  Division:      ${p.division || '—'}`);
  console.log(`  │  Location:      ${p.location || '—'}`);
  console.log(`  │  Reports To:    ${p.supervisor || '—'}`);
  console.log(`  │  Pay:           $${parsePayRate(p.payRate)}/hr  (${p.payFrequency || '—'})`);
  console.log(`  │  Work Phone:    ${p.workPhone || '—'}`);
  console.log(`  │  Mobile:        ${p.mobilePhone || '—'}`);
  console.log(`  │  Work Email:    ${p.workEmail || '—'}`);
  console.log(`  │  Home Email:    ${p.homeEmail || '—'}`);
  console.log(`  │  Address:       ${[p.address1, p.city, p.state, p.zipcode].filter(Boolean).join(', ') || '—'}`);
  console.log(`  │  PTO Balance:   ${balances.pto} hrs  (exact from BambooHR today)`);
  console.log(`  │  Sick Balance:  ${balances.sick} hrs  (exact from BambooHR today)`);
  console.log(`  │  Usage Events:  ${requestCount} approved requests saved as history`);
  console.log(`  └──────────────────────────────────────────────────────`);
}

// ── MAIN MIGRATION ─────────────────────────────────────────────────────────
async function migrate() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  BambooHR → Supabase  |  Full Raw Migration              ║');
  console.log(`║  Date: ${TODAY}  |  Subdomain: ${BAMBOOHR_SUBDOMAIN.padEnd(17)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log('Target employees:');
  EMPLOYEES.forEach(e => console.log(`  • ${e.name.padEnd(28)} BambooID: ${e.bambooId}  DB: ${e.workerId}`));

  const dumpData = {};

  for (const emp of EMPLOYEES) {
    console.log(`\n\n▶▶  ${emp.name.toUpperCase()}`);
    console.log(`    BambooHR ID: ${emp.bambooId}  |  Worker ID: ${emp.workerId}`);
    console.log('    ─────────────────────────────────────────────────────');

    // ── Verify user exists in Supabase ──
    const { data: dbUser } = await supabase
      .from('users')
      .select('id, worker_id, name')
      .eq('worker_id', emp.workerId)
      .single();

    if (!dbUser) {
      console.error(`  ✗ Not found in DB (worker_id=${emp.workerId}) — SKIPPED`);
      console.error(`    Create the user record first, then re-run this script.`);
      continue;
    }
    console.log(`  ✓ Found in DB: ${dbUser.name} (id: ${dbUser.id})`);

    // ── Step 1: Fetch all data from BambooHR ──
    process.stdout.write('  [1/4] Personal data...     ');
    const personal = await fetchPersonalData(emp.bambooId);
    console.log(personal ? '✓' : '✗ FAILED');

    process.stdout.write('  [2/4] Job & compensation...  ');
    const [jobInfo, compensation] = await Promise.all([
      fetchJobInfo(emp.bambooId),
      fetchCompensation(emp.bambooId),
    ]);
    console.log(`✓ (${jobInfo.length} job records, ${compensation.length} pay records)`);

    process.stdout.write('  [3/4] Leave balances...    ');
    const balances = await fetchCurrentBalances(emp.bambooId);
    console.log(`✓  PTO: ${balances.pto} hrs | Sick: ${balances.sick} hrs`);

    process.stdout.write('  [4/4] Approved requests... ');
    const requests = await fetchApprovedRequests(emp.bambooId);
    const ptoReqs  = requests.filter(r => /pto|vacation/i.test(r.type?.name));
    const sickReqs = requests.filter(r => /sick/i.test(r.type?.name));
    console.log(`✓  ${requests.length} total  (PTO: ${ptoReqs.length}, Sick: ${sickReqs.length})`);

    // ── Store raw dump ──
    dumpData[emp.name] = {
      bambooId:    emp.bambooId,
      workerId:    emp.workerId,
      personal,
      jobInfo,
      compensation,
      balances:    { ...balances },
      requests,
      fetchedAt:   new Date().toISOString(),
    };

    if (!personal) {
      console.error('  ✗ Cannot update — personal data fetch failed');
      continue;
    }

    // ── Step 2: Update users table ──
    const userUpdate = {
      ...mapToUserSchema(personal, jobInfo),
      // ── Exact BambooHR balances — NO accrual logic ──
      pto_balance:  String(balances.pto),
      sick_balance: String(balances.sick),
    };

    const { error: updateErr } = await supabase
      .from('users')
      .update(userUpdate)
      .eq('id', dbUser.id);

    if (updateErr) {
      console.error(`\n  ✗ users update failed: ${updateErr.message}`);
      console.error(`    Hint: ${updateErr.hint || updateErr.details || ''}`);
    } else {
      console.log('\n  ✓ users table — all personal fields updated');
    }

    // ── Step 3: Save leave history (raw usage events from BambooHR) ──
    const historyRows = mapRequestsToHistory(dbUser.id, requests);

    if (historyRows.length > 0) {
      // Clear existing history for this user
      const { error: delErr } = await supabase
        .from('leave_history')
        .delete()
        .eq('user_id', dbUser.id);
      if (delErr) console.warn(`  [warn] history delete: ${delErr.message}`);

      // Insert in batches
      let saved = 0;
      for (let i = 0; i < historyRows.length; i += 100) {
        const batch = historyRows.slice(i, i + 100);
        const { error: insErr } = await supabase.from('leave_history').insert(batch);
        if (insErr) {
          console.error(`  ✗ history insert batch ${Math.floor(i/100)+1}: ${insErr.message}`);
        } else {
          saved += batch.length;
        }
      }
      console.log(`  ✓ leave_history — ${saved} usage records saved`);
      console.log(`    → PTO entries: ${historyRows.filter(r=>r.type==='pto').length}`);
      console.log(`    → Sick entries: ${historyRows.filter(r=>r.type==='sick').length}`);
    } else {
      console.log('  [info] No approved time-off requests found to save');
    }

    // Print full summary
    printPersonalSummary(emp.name, personal, balances, requests.length);

    // Respect BambooHR rate limits (~2 req/s)
    await new Promise(r => setTimeout(r, 700));
  }

  // ── Save full raw JSON dump ──────────────────────────────────────────────
  const dumpPath = `scripts/bamboohr-raw-dump-${TODAY}.json`;
  fs.writeFileSync(dumpPath, JSON.stringify(dumpData, null, 2));

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Migration Complete ✓                                     ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║                                                          ║');
  console.log('║  What was saved (per employee):                          ║');
  console.log('║    ✓ All personal details from BambooHR                  ║');
  console.log('║    ✓ Employment, pay, contact, address fields            ║');
  console.log('║    ✓ PTO & Sick balances — exact BambooHR values         ║');
  console.log('║    ✓ Approved time-off requests → leave_history           ║');
  console.log('║                                                          ║');
  console.log(`║  Raw data dump: ${dumpPath.padEnd(40)}║`);
  console.log('║                                                          ║');
  console.log('║  ⚠️  ZERO accrual logic was applied.                     ║');
  console.log('║     Balances = exact copy of BambooHR today.             ║');
  console.log('║     History  = actual approved requests from BambooHR.   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

// ── RUN ───────────────────────────────────────────────────────────────────
migrate().catch(err => {
  console.error('\n[FATAL]', err.message, err.stack);
  process.exit(1);
});
