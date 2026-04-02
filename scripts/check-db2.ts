import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    const { data, error } = await sb.from('training_materials').select('level,category,display_name,file_path');
    if (error) {
        fs.writeFileSync('scripts/db-result.json', JSON.stringify({ error: error.message }));
        return;
    }
    
    const spanish = data.filter((r: any) => r.file_path?.startsWith('Spanish/'));
    const english = data.filter((r: any) => !r.file_path?.startsWith('Spanish/'));
    
    const result = {
        total: data.length,
        english_count: english.length,
        spanish_count: spanish.length,
        english: english,
        spanish: spanish
    };
    
    fs.writeFileSync('scripts/db-result.json', JSON.stringify(result, null, 2));
    console.log('Written to scripts/db-result.json');
    console.log('Total:', data.length, '| English:', english.length, '| Spanish:', spanish.length);
}

check().catch(console.error);
