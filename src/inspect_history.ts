import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function dumpToday() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Dumping all leave_history entries for ${today}...`);
    
    const { data, error } = await supabase
        .from('leave_history')
        .select('*, user:users(name)')
        .gte('created_at', today + 'T00:00:00')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No rows found for today.');
        return;
    }

    data.forEach(row => {
        console.log(`[${row.created_at}] User: ${row.user?.name} | Desc: "${row.description}" | Earned: ${row.earned_hours} | Bal: ${row.balance}`);
    });
}

dumpToday();
