import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function cleanup() {
    const todayStr = '2026-04-16'; // Today's date
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`Starting cleanup for ${today}...`);

    // 1. Find all history entries for today
     const { data: history, error: hError } = await supabase
        .from('leave_history')
        .select('*')
        .eq('entry_date', today)
        .eq('type', 'pto');

    if (hError) throw hError;

    // Group by user
    const userMap = new Map<string, any[]>();
    history?.forEach(row => {
        const list = userMap.get(row.user_id) || [];
        list.push(row);
        userMap.set(row.user_id, list);
    });

    for (const [userId, rows] of userMap.entries()) {
        if (rows.length > 1) {
            console.log(`User ${userId} has ${rows.length} duplicates for today.`);
            
            // Keep the EARLIEST row, delete the others
            const sorted = rows.sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const keep = sorted[0];
            const toDelete = sorted.slice(1).map(r => r.id);

            console.log(`  Deleting row IDs: ${toDelete.join(', ')}`);
            const { error: dError } = await supabase
                .from('leave_history')
                .delete()
                .in('id', toDelete);
            
            if (dError) console.error(`  Error deleting for user ${userId}:`, dError);
            else console.log(`  Successfully cleaned up user ${userId}.`);

            // 2. Fix the user balance in the users table
            // We set it to the balance of the ONE row we kept
            const { error: uError } = await supabase
                .from('users')
                .update({ pto_balance: String(keep.balance) })
                .eq('id', userId);
            
            if (uError) console.error(`  Error updating user balance for ${userId}:`, uError);
            else console.log(`  Corrected balance to ${keep.balance} for user ${userId}.`);
        }
    }
    
    console.log('Cleanup complete.');
}

cleanup().catch(console.error);
