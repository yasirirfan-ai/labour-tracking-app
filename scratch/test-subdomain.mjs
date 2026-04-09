import axios from 'axios';

const BAMBOOHR_API_KEY = 'ce454c0bf1e7439e5379fae899f2d6f3d06fb9b7';
const auth = Buffer.from(`${BAMBOOHR_API_KEY}:x`).toString('base64');
const subdomains = ['ukut', 'puritycosmetics'];

async function testSubdomains() {
  for (const sub of subdomains) {
    try {
      console.log(`Testing subdomain: ${sub}`);
      const res = await axios.get(
        `https://api.bamboohr.com/api/gateway.php/${sub}/v1/employees/directory`,
        { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
      );
      console.log(`Success for ${sub}!`);
      return sub;
    } catch (e) {
      console.log(`Failed for ${sub}: ${e.response?.status || e.message}`);
    }
  }
}

testSubdomains();
