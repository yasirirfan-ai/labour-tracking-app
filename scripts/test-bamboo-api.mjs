import axios from 'axios';

const BAMBOOHR_SUBDOMAIN = 'ukut';
const BAMBOOHR_API_KEY = 'ce454c0bf1e7439e5379fae899f2d6f3d06fb9b7';
const auth = Buffer.from(`${BAMBOOHR_API_KEY}:x`).toString('base64');

async function testWorking() {
    try {
        const date = '2024-03-01';
        const res = await axios.get(
            `https://api.bamboohr.com/api/gateway.php/${BAMBOOHR_SUBDOMAIN}/v1/employees/41227/time_off/calculator?date=${date}`,
            { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
        );
        console.log('Success, data:', res.data);
    } catch (err) {
        console.error('Error:', err.message);
    }
}
testWorking();
