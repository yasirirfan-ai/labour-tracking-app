export default async function handler(req, res) {
    // Set CORS headers for the response
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const response = await fetch('https://us-central1-pythonautomation-430712.cloudfunctions.net/laborTrackAPI', {
            headers: {
                'X-APP-KEY': 'Y3JhY2t3YXNoc2VydmVib3VuZHRoaW5rd2luZHBsYW50Y29ubmVjdGVkbG9uZ2VybG8='
            }
        });

        if (!response.ok) {
            throw new Error(`External API responded with ${response.status}`);
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: error.message });
    }
}
