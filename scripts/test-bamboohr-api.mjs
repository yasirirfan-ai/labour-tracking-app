import axios from 'axios';

const BAMBOOHR_SUBDOMAIN = 'ukut';
const BAMBOOHR_API_KEY = 'ce454c0bf1e7439e5379fae899f2d6f3d06fb9b7';
const auth = Buffer.from(`${BAMBOOHR_API_KEY}:x`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Accept': 'application/json'
};

const employeeId = '41227'; // Elkin Acevedo

async function test() {
  const endpoints = [
    `https://api.bamboohr.com/api/gateway.php/${BAMBOOHR_SUBDOMAIN}/v1/employees/${employeeId}/time_off/calculator?date=2024-04-09`
  ];

  for (const url of endpoints) {
    console.log(`\n--- Testing ${url} ---`);
    try {
      const res = await axios.get(url, { headers });
      console.log(`SUCCESS:`, JSON.stringify(res.data, null, 2).substring(0, 500));
    } catch (e) {
      console.log(`FAILED: ${e.response?.status} ${e.response?.statusText}`);
    }
  }
}

test();
