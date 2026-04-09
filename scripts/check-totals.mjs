import axios from 'axios';
const SUB = 'puritycosmetics';
const KEY = '899b841c531f6b492431c81e1c75ca7504909396';
const auth = Buffer.from(`${KEY}:x`).toString('base64');
const H = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
const BASE = `https://api.bamboohr.com/api/gateway.php/${SUB}`;

const emps = [
  { id: 41227, name: 'Elkin',    ptoBalance: 14.30, sickBalance: 11.51 },
  { id: 41228, name: 'Felipe',   ptoBalance: 38.30, sickBalance: 11.51 },
  { id: 40538, name: 'Sandra',   ptoBalance: 35.29, sickBalance: 48.00 },
  { id: 40609, name: 'Sarbelio', ptoBalance: 32.29, sickBalance: 40.00 },
];

for (const e of emps) {
  const r = await axios.get(
    `${BASE}/v1/time_off/requests/?start=2015-01-01&end=2026-04-07&employeeId=${e.id}`,
    { headers: H }
  );
  const all = r.data;
  const approved = all.filter(x => x.status.status === 'approved');
  const pto  = approved.filter(x => /pto|vacation/i.test(x.type.name));
  const sick = approved.filter(x => /sick/i.test(x.type.name));
  const totalPto  = pto.reduce((s, x) => s + parseFloat(x.amount.amount), 0);
  const totalSick = sick.reduce((s, x) => s + parseFloat(x.amount.amount), 0);
  const totalPtoEarned  = e.ptoBalance  + totalPto;
  const totalSickEarned = e.sickBalance + totalSick;

  console.log(`\n${e.name}:`);
  console.log(`  Approved PTO requests: ${pto.length}  | Total used: ${totalPto.toFixed(2)} hrs`);
  console.log(`  Approved Sick requests: ${sick.length} | Total used: ${totalSick.toFixed(2)} hrs`);
  console.log(`  Total PTO ever earned:  ${totalPtoEarned.toFixed(2)} hrs`);
  console.log(`  Total Sick ever earned: ${totalSickEarned.toFixed(2)} hrs`);
}
