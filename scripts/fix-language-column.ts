import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    console.log('🔧 Checking current training_materials records...');

    // First, fetch all records to see what we have
    const { data: allRecords, error: fetchError } = await supabase
        .from('training_materials')
        .select('id, display_name, file_path, language');

    if (fetchError) {
        console.error('❌ Error fetching records:', fetchError.message);
        // Column might not exist — this is the issue
        if (fetchError.message.includes('language') || fetchError.code === 'PGRST204') {
            console.log('⚠️  The language column does not exist in the DB. Please run this SQL in Supabase Dashboard:');
            console.log('');
            console.log('ALTER TABLE public.training_materials ADD COLUMN IF NOT EXISTS language text DEFAULT \'en\';');
            console.log('UPDATE public.training_materials SET language = \'en\' WHERE language IS NULL;');
            console.log('');
        }
        return;
    }

    console.log(`✅ Found ${allRecords?.length ?? 0} records.`);
    allRecords?.forEach(r => {
        console.log(`  - [${r.language ?? 'NULL'}] ${r.display_name} (${r.file_path})`);
    });

    // Update any records with NULL language to 'en'
    const nullRecords = allRecords?.filter(r => !r.language) || [];
    if (nullRecords.length > 0) {
        console.log(`\n🔄 Updating ${nullRecords.length} records with NULL language to 'en'...`);
        const ids = nullRecords.map(r => r.id);
        const { error: updateError } = await (supabase as any)
            .from('training_materials')
            .update({ language: 'en' })
            .in('id', ids);

        if (updateError) {
            console.error('❌ Update error:', updateError.message);
        } else {
            console.log('✅ Updated records to language = en');
        }
    } else {
        console.log('\n✅ All records already have a language set.');
    }

    // Final count by language
    const { data: final } = await supabase.from('training_materials').select('language');
    const counts: Record<string, number> = {};
    final?.forEach(r => { counts[r.language] = (counts[r.language] || 0) + 1; });
    console.log('\n📊 Final summary:');
    Object.entries(counts).forEach(([lang, count]) => {
        console.log(`  ${lang}: ${count} materials`);
    });

    console.log('\n🏁 Done!');
}

main();
