const fs = require('fs');

const credentials = JSON.parse(fs.readFileSync('credentials_export.json', 'utf8'));

let htmlData = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>Worker Credentials</title>
<style>
    table { border-collapse: collapse; width: 100%; font-family: Calibri, sans-serif; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
    h2 { font-family: Calibri, sans-serif; color: #2E5894; }
</style>
</head>
<body>
    <h2>Labour Tracking App - Worker Credentials Audit</h2>
    <p>Generation Date: ${new Date().toLocaleString()}</p>
    <table>
        <thead>
            <tr>
                <th>Employee Name</th>
                <th>Username</th>
                <th>Password</th>
            </tr>
        </thead>
        <tbody>
`;

credentials.forEach(cred => {
    htmlData += `
            <tr>
                <td>${cred.name}</td>
                <td>${cred.username}</td>
                <td><code>${cred.password}</code></td>
            </tr>`;
});

htmlData += `
        </tbody>
    </table>
</body>
</html>
`;

fs.writeFileSync('Worker_Credentials.doc', htmlData);
console.log("Worker_Credentials.doc has been generated.");
