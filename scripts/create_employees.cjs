const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const employeesToCreate = [
    {
        name: "Erick Montano",
        first_name: "Erick",
        last_name: "Montano",
        username: "erick.montano",
        worker_id: "W-001"
    },
    {
        name: "Juan Avila",
        first_name: "Juan",
        last_name: "Avila",
        username: "juan.avila",
        worker_id: "W-002"
    }
];

async function createEmployees() {
    console.log("Creating new employees...");

    const results = [];

    for (const emp of employeesToCreate) {
        const password = 'worker' + Math.floor(1000 + Math.random() * 9000);
        const payload = {
            ...emp,
            password: password,
            role: 'employee',
            hourly_rate: 20.00,
            active: true
        };

        const { data, error } = await supabase
            .from('users')
            .insert(payload)
            .select();

        if (error) {
            console.error(`Error creating ${emp.name}:`, error.message);
            results.push({ name: emp.name, status: "Error", message: error.message });
        } else {
            console.log(`Successfully created ${emp.name}`);
            results.push({
                name: emp.name,
                status: "Success",
                username: emp.username,
                password: password,
                worker_id: emp.worker_id
            });
        }
    }

    require('fs').writeFileSync('creation_results.json', JSON.stringify(results, null, 2));
    console.log("Results saved to creation_results.json");
}

createEmployees();
