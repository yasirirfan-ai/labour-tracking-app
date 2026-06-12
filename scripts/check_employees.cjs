const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const employeesToCheck = [
    "Felipe Acevedo",
    "Sandra Bonilla",
    "Erick Montano",
    "Elkin Acevedo",
    "Juan Avila",
    "Nicky Lei",
    "Sangyong Lee",
    "Liyuan Ji",
    "Douglas Le",
    "Cody Chalker",
    "Jesse Chalker",
    "Arpad Karsai"
];

async function checkEmployees() {
    let report = "--- EMPLOYEE CHECK REPORT ---\n\n";

    try {
        // Fetch ALL users to do a robust comparison (can handle case-insensitive or typos if needed)
        const { data: allUsers, error } = await supabase
            .from('users')
            .select('name');

        if (error) {
            report += `ERROR: Failed to fetch users: ${error.message}\n`;
            fs.writeFileSync('employee_report.txt', report);
            return;
        }

        const dbNames = allUsers.map(u => u.name || "");
        const dbNamesLower = dbNames.map(n => n.toLowerCase());

        const found = [];
        const missing = [];

        for (const name of employeesToCheck) {
            if (dbNamesLower.includes(name.toLowerCase())) {
                const originalName = dbNames[dbNamesLower.indexOf(name.toLowerCase())];
                found.push(`${name} (Found as: ${originalName})`);
            } else {
                missing.push(name);
            }
        }

        report += `Total employees checked: ${employeesToCheck.length}\n`;
        report += `Found: ${found.length}\n`;
        report += `Missing: ${missing.length}\n\n`;

        report += "MISSING EMPLOYEES:\n";
        if (missing.length > 0) {
            missing.forEach(m => report += `- ${m}\n`);
        } else {
            report += "(None)\n";
        }

        report += "\nFOUND EMPLOYEES:\n";
        found.forEach(f => report += `+ ${f}\n`);

    } catch (err) {
        report += `CRITICAL ERROR: ${err.message}\n`;
    }

    fs.writeFileSync('employee_report.txt', report);
    console.log("Report generated in employee_report.txt");
}

checkEmployees();
