import axios from 'axios';

const subdomain = 'puritycosmetics';
const apiKey = 'ce454c0bf1e7439e5379fae899f2d6f3d06fb9b7';
const auth = Buffer.from(`${apiKey}:x`).toString('base64');

async function test() {
  const employeeId = '41227';
  const endpoints = [
    `v1/employees/${employeeId}/time_off/history/`,
    `v1/employees/${employeeId}/time_off/history?type=1`, // PTO usually 1 or 2
    `v1/employees/${employeeId}/time_off/history?type=2`,
  ];

  for (const ep of endpoints) {
    console.log(`\n--- Testing ${ep} ---`);
    try {
      const res = await axios.get(`https://api.bamboohr.com/api/gateway.php/${subdomain}/${ep}`, {
        headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
      });
      console.log('SUCCESS (JSON)');
      console.log(JSON.stringify(res.data, null, 2).substring(0, 1000));
    } catch (e) {
      console.log(`FAILED (JSON): ${e.response?.status} - ${e.message}`);
      try {
        const resXml = await axios.get(`https://api.bamboohr.com/api/gateway.php/${subdomain}/${ep}`, {
          headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/xml' }
        });
        console.log('SUCCESS (XML)');
        console.log(resXml.data.substring(0, 1000));
      } catch (e2) {
         console.log(`FAILED (XML): ${e2.response?.status} - ${e2.message}`);
      }
    }
  }
}

test();
