import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    const { data, error } = await sb.from('training_materials').select('level,category,display_name,file_path');
    if (error) { console.error('DB Error:', error.message); return; }
    
    const spanish = data.filter(r => r.file_path?.startsWith('Spanish/'));
    const english = data.filter(r => !r.file_path?.startsWith('Spanish/'));
    
    console.log(`\n✅ Total records: ${data.length}`);
    console.log(`   English: ${english.length} | Spanish: ${spanish.length}\n`);
    
    console.log('=== ENGLISH RECORDS ===');
    english.forEach(r => console.log(`  L${r.level} | ${r.category} | ${r.display_name}`));
    
    console.log('\n=== SPANISH RECORDS ===');
    spanish.forEach(r => console.log(`  L${r.level} | ${r.category} | ${r.display_name}`));
}

check().catch(console.error);
