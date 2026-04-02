import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

const SPANISH_DIR = 'C:/Users/ESHOP/Downloads/Spanish/Spanish';

// All 16 PDFs in the folder — map each to a category for the app
const ALL_PDF_MAPPINGS = [
    // Spanish-named PDFs
    {
        file: 'Personal y Capacitación 3.4-2 - Training Material rev.101424.pdf',
        display_name: 'Personal y Capacitación',
        category: 'Personnel and Training',
        level: 1
    },
    {
        file: 'Política de Visitantes - Training Material rev.101124.pdf',
        display_name: 'Política de Visitantes',
        category: 'Visitor Policy',
        level: 1
    },
    {
        file: 'Vestimenta, Lavado de Manos y Conducta 3.5.2 - Training Material rev.101424.pdf',
        display_name: 'Vestimenta, Lavado de Manos y Conducta',
        category: 'Gowning, Hand washing and Conduct',
        level: 1
    },
    {
        file: 'Limpieza y Saneamiento de Instalaciones 4.10.0 - Training Material rev.101424.pdf',
        display_name: 'Limpieza y Saneamiento de Instalaciones',
        category: 'Premises Cleaning and Sanitation',
        level: 1
    },
    {
        file: 'Control de Plagas 4.13 - Training Material rev101524.pdf',
        display_name: 'Control de Plagas',
        category: 'Pest Control',
        level: 1
    },
    {
        file: 'Respuesta a Material Biológico Peligroso - Training Material rev.101124.pdf',
        display_name: 'Respuesta a Material Biológico Peligroso',
        category: 'Biohazard Response',
        level: 1
    },
    {
        file: 'Buenas Prácticas de Manufactura (BPM) _updated_10152024.pdf',
        display_name: 'Buenas Prácticas de Manufactura (BPM)',
        category: 'GMP Training Presentation',
        level: 1
    },
    // English-named PDFs that are also in this Spanish folder
    {
        file: 'Personnel and Training 3.4-2 - Training Material rev.101024.pdf',
        display_name: 'Personnel and Training',
        category: 'Personnel and Training',
        level: 1
    },
    {
        file: 'Visitor Policy - Training Material rev.101124.pdf',
        display_name: 'Visitor Policy',
        category: 'Visitor Policy',
        level: 1
    },
    {
        file: 'Gowning, Hand washing and Conduct 3.5.2 - Training Material rev.112524.pdf',
        display_name: 'Gowning, Hand washing and Conduct',
        category: 'Gowning, Hand washing and Conduct',
        level: 1
    },
    {
        file: 'Premises Cleaning and Sanitation - Training Material rev.030425.pdf',
        display_name: 'Premises Cleaning and Sanitation',
        category: 'Premises Cleaning and Sanitation',
        level: 1
    },
    {
        file: 'Pest Control 4.13 - Training Material rev101124.pdf',
        display_name: 'Pest Control',
        category: 'Pest Control',
        level: 1
    },
    {
        file: 'Biohazard Response - Training Material rev.101124.pdf',
        display_name: 'Biohazard Response',
        category: 'Biohazard Response',
        level: 1
    },
    {
        file: 'GMP_presentation_short_updated_02202025.pdf',
        display_name: 'GMP Presentation (Short, Feb 2025)',
        category: 'GMP Training Presentation',
        level: 1
    },
    {
        file: 'GMP_presentation_updated_08012024.pdf',
        display_name: 'GMP Presentation (Aug 2024)',
        category: 'GMP Training Presentation',
        level: 1
    },
    {
        file: 'GMP_presentation_updated_12162024.pdf',
        display_name: 'GMP Presentation (Dec 2024)',
        category: 'GMP Training Presentation',
        level: 1
    }
];

async function main() {
    console.log('=== Spanish Training Materials Upload ===\n');

    // Step 1: Check what's currently in the DB
    console.log('📋 Step 1: Checking current DB records...');
    const { data: existing, error: listErr } = await supabase
        .from('training_materials')
        .select('id, display_name, file_path');

    if (listErr) {
        console.error('❌ Could not read DB:', listErr.message);
        return;
    }
    console.log(`   Found ${existing?.length ?? 0} total records in DB`);
    
    const existingSpanish = existing?.filter(r => r.file_path?.startsWith('Spanish/'));
    console.log(`   Found ${existingSpanish?.length ?? 0} Spanish records`);

    // Step 2: Delete existing Spanish records to start fresh
    if (existingSpanish && existingSpanish.length > 0) {
        console.log('\n🗑️  Step 2: Removing old Spanish records...');
        const ids = existingSpanish.map(r => r.id);
        const { error: delErr } = await (supabase as any)
            .from('training_materials')
            .delete()
            .in('id', ids);
        if (delErr) {
            console.error('❌ Delete error:', delErr.message);
        } else {
            console.log(`   ✅ Deleted ${ids.length} old Spanish records`);
        }
    } else {
        console.log('\n✅ Step 2: No old Spanish records to clean up');
    }

    // Step 3: Upload all PDFs and register in DB
    console.log('\n📤 Step 3: Uploading all PDFs...\n');
    let successCount = 0;
    let failCount = 0;

    for (const item of ALL_PDF_MAPPINGS) {
        const fullPath = path.join(SPANISH_DIR, item.file);

        if (!fs.existsSync(fullPath)) {
            console.log(`   ⚠️  File not found, skipping: ${item.file}`);
            failCount++;
            continue;
        }

        const fileBuffer = fs.readFileSync(fullPath);
        // Sanitize filename: replace accented chars and special chars not allowed by Supabase storage
        const sanitizedFile = item.file
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accent diacritics
            .replace(/[()]/g, '')                              // remove parentheses
            .replace(/\s+/g, '_');                             // spaces to underscores
        const storagePath = `Spanish/Level1/${sanitizedFile}`;

        process.stdout.write(`   ⬆️  Uploading: ${item.display_name}... `);

        const { error: uploadErr } = await supabase.storage
            .from('training-materials')
            .upload(storagePath, fileBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadErr) {
            console.log(`FAILED (${uploadErr.message})`);
            failCount++;
            continue;
        }

        const { error: dbErr } = await (supabase as any)
            .from('training_materials')
            .insert({
                level: item.level,
                category: item.category,
                display_name: item.display_name,
                file_path: storagePath,
                department: null
            });

        if (dbErr) {
            console.log(`UPLOAD OK but DB FAILED (${dbErr.message})`);
            failCount++;
        } else {
            console.log('✅');
            successCount++;
        }
    }

    // Step 4: Final summary
    console.log('\n=== Summary ===');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);

    const { data: finalRecords } = await supabase
        .from('training_materials')
        .select('file_path');
    
    const spanishCount = finalRecords?.filter(r => r.file_path?.startsWith('Spanish/')).length ?? 0;
    const englishCount = (finalRecords?.length ?? 0) - spanishCount;
    console.log(`\n📊 DB now has: ${englishCount} English + ${spanishCount} Spanish materials`);
    console.log('\n🏁 Done! Refresh your app to see Spanish training materials.');
}

main().catch(console.error);
