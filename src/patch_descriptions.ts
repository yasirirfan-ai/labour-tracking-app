import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function patchDescriptions() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Patching descriptions for ${today}...`);

    const { data: history, error: hError } = await supabase
        .from('leave_history')
        .select('*')
        .eq('entry_date', today)
        .eq('type', 'pto');

    if (hError) throw hError;

    for (const row of (history || [])) {
        if (row.description.startsWith('PTO accrual')) {
            // Convert to "Accrual for 04/01/2026 to 04/15/2026" or similar
            // For today (April 16), it's the April 1-15 period.
            const newDesc = "Accrual for 04/01/2026 to 04/15/2026";
            console.log(`Updating row ${row.id}: "${row.description}" -> "${newDesc}"`);
            
            const { error: uError } = await supabase
                .from('leave_history')
                .update({ description: newDesc })
                .eq('id', row.id);
            
            if (uError) console.error(`  Error updating row ${row.id}:`, uError);
        }
    }
    
    console.log('Patch complete.');
}

patchDescriptions().catch(console.error);
