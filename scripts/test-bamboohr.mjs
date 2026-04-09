import axios from 'axios';

const subdomain = 'puritycosmetics';
const apiKey = 'ce454c0bf1e7439e5379fae899f2d6f3d06fb9b7';
const auth = Buffer.from(`${apiKey}:x`).toString('base64');

async function test() {
  try {
    const response = await axios.get(`https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/employees/directory`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });
    
    const employees = response.data.employees;
    const targets = ['Elkin Acevedo', 'Felipe Acevedo', 'Sandra Bonilla', 'Erik Montano'];
    
    console.log('Testing balances fetch (ID: 41227)...');
    try {
        const bal = await axios.get(`https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/employees/41227/time_off/calculator/?date=2026-04-06`, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });
        console.log('Balances:', bal.data);
    } catch (e) {
        console.error('Balance Error:', e.response?.data || e.message);
    }

    console.log('\nTesting requests fetch (Global with filter)...');
    try {
        const reqs = await axios.get(`https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/time_off/requests/?start=2024-01-01&end=2026-12-31&status=approved&employeeId=41227`, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });
        console.log('Requests count:', reqs.data?.length || 0);
        if (reqs.data?.length > 0) console.log('Sample Request:', reqs.data[0]);
    } catch (e) {
        console.error('Requests Error:', e.response?.data || e.message);
    }

    console.log('\nTesting endpoint (XML): v1/employees/41227/time_off/history/?type=2...');
    try {
        const res = await axios.get(`https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/employees/41227/time_off/history/?type=2`, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/xml' }
        });
        console.log(`SUCCESS (XML): length ${res.data.length}`);
        console.log('Sample data:', res.data.substring(0, 1000));
    } catch (e) {
        console.log(`FAILED (XML): ${e.message}`);
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();
