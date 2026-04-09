import axios from 'axios';

const BAMBOOHR_SUBDOMAIN = 'puritycosmetics';
const BAMBOOHR_API_KEY = 'ce454c0bf1e7439e5379fae899f2d6f3d06fb9b7';
const auth = Buffer.from(`${BAMBOOHR_API_KEY}:x`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Accept': 'application/json'
};

const employeeId = '40609'; // Sarbelio Montano

async function test() {
  const years = ['2025', '2024'];
  for (const year of years) {
    const url = `https://api.bamboohr.com/api/gateway.php/${BAMBOOHR_SUBDOMAIN}/v1/employees/${employeeId}/time_off/history/?year=${year}`;
    console.log(`Testing ${url}...`);
    try {
      const res = await axios.get(url, { headers });
      console.log(`SUCCESS:`, JSON.stringify(res.data, null, 2).substring(0, 500));
    } catch (e) {
      console.log(`FAILED: ${e.response?.status} ${e.response?.statusText}`);
    }
  }
}

test();
