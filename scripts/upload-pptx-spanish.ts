import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

const SOURCE_DIR = 'C:/Users/ESHOP/Downloads/Training Materials-20260402T194343Z-1-001/Training Materials';

// All 17 PPTX files grouped into 7 Spanish-named categories
const ALL_PPTX_MAPPINGS = [
    // Biohazard
    { file: 'Biohazard Response - Training Material rev.101124.pptx',                          display_name: 'Biohazard Response',                          category: 'Respuesta a Material Biológico Peligroso', level: 1 },
    { file: 'Respuesta a Material Biológico Peligroso - Training Material rev.101124.pptx',    display_name: 'Respuesta a Material Biológico Peligroso',    category: 'Respuesta a Material Biológico Peligroso', level: 1 },

    // GMP / BPM
    { file: 'GMP_presentation_short_updated_02202025.pptx',                                    display_name: 'GMP Presentation (Short, Feb 2025)',          category: 'GMP / Buenas Prácticas de Manufactura', level: 1 },
    { file: 'GMP_presentation_updated_08012024.pptx',                                          display_name: 'GMP Presentation (Aug 2024)',                 category: 'GMP / Buenas Prácticas de Manufactura', level: 1 },
    { file: 'GMP_presentation_updated_12162024.pptx',                                          display_name: 'GMP Presentation (Dec 2024)',                 category: 'GMP / Buenas Prácticas de Manufactura', level: 1 },
    { file: 'Buenas Prácticas de Manufactura (BPM) _updated_04012026.pptx',                    display_name: 'Buenas Prácticas de Manufactura (Abr 2026)', category: 'GMP / Buenas Prácticas de Manufactura', level: 1 },
    { file: 'Buenas Prácticas de Manufactura (BPM) _updated_10152024.pptx',                    display_name: 'Buenas Prácticas de Manufactura (Oct 2024)', category: 'GMP / Buenas Prácticas de Manufactura', level: 1 },

    // Gowning / Vestimenta
    { file: 'Gowning, Hand washing and Conduct 3.5.2 - Training Material rev.112524.pptx',    display_name: 'Gowning, Hand washing and Conduct',           category: 'Vestimenta, Lavado de Manos y Conducta', level: 1 },
    { file: 'Vestimenta, Lavado de Manos y Conducta 3.5.2 - Training Material rev.101424.pptx', display_name: 'Vestimenta, Lavado de Manos y Conducta',   category: 'Vestimenta, Lavado de Manos y Conducta', level: 1 },

    // Personnel / Personal
    { file: 'Personnel and Training 3.4-2 - Training Material rev.101024.pptx',               display_name: 'Personnel and Training',                     category: 'Personal y Capacitación', level: 1 },
    { file: 'Personal y Capacitación 3.4-2 - Training Material rev.101424.pptx',              display_name: 'Personal y Capacitación',                    category: 'Personal y Capacitación', level: 1 },

    // Pest Control / Control de Plagas
    { file: 'Pest Control 4.13 - Training Material rev101124.pptx',                           display_name: 'Pest Control',                               category: 'Control de Plagas', level: 1 },
    { file: 'Control de Plagas 4.13 - Training Material rev101524.pptx',                      display_name: 'Control de Plagas',                          category: 'Control de Plagas', level: 1 },

    // Premises Cleaning / Limpieza
    { file: 'Premises Cleaning and Sanitation - Training Material rev.030425.pptx',           display_name: 'Premises Cleaning and Sanitation',           category: 'Limpieza y Saneamiento de Instalaciones', level: 1 },
    { file: 'Limpieza y Saneamiento de Instalaciones 4.10.0 - Training Material rev.101424.pptx', display_name: 'Limpieza y Saneamiento de Instalaciones', category: 'Limpieza y Saneamiento de Instalaciones', level: 1 },

    // Visitor Policy / Política de Visitantes
    { file: 'Visitor Policy - Training Material rev.101124.pptx',                             display_name: 'Visitor Policy',                             category: 'Política de Visitantes', level: 1 },
    { file: 'Política de Visitantes - Training Material rev.101124.pptx',                     display_name: 'Política de Visitantes',                     category: 'Política de Visitantes', level: 1 },
];

function sanitizeFilename(filename: string): string {
    return filename
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
        .replace(/[(),]/g, '')                             // remove ( ) ,
        .replace(/\s+/g, '_');                             // spaces → underscores
}

async function main() {
    console.log('=== PPTX Spanish Training Materials Upload ===\n');

    // Step 1: Remove old Spanish PPTX records
    console.log('📋 Step 1: Checking existing Spanish records...');
    const { data: existing, error: listErr } = await (supabase as any)
        .from('training_materials')
        .select('id, file_path');

    if (listErr) { console.error('❌ DB read error:', listErr.message); return; }

    const oldSpanish = (existing || []).filter((r: any) => r.file_path?.startsWith('Spanish/'));
    console.log(`   Found ${oldSpanish.length} existing Spanish records`);

    if (oldSpanish.length > 0) {
        const ids = oldSpanish.map((r: any) => r.id);
        const { error: delErr } = await (supabase as any)
            .from('training_materials')
            .delete()
            .in('id', ids);
        if (delErr) console.error('   ⚠️  Delete warning:', delErr.message);
        else console.log(`   ✅ Deleted ${ids.length} old Spanish records`);
    }

    // Step 2: Upload each PPTX and register in DB
    console.log('\n📤 Step 2: Uploading PPTX files...\n');
    let ok = 0, fail = 0;

    for (const item of ALL_PPTX_MAPPINGS) {
        const fullPath = path.join(SOURCE_DIR, item.file);

        if (!fs.existsSync(fullPath)) {
            console.log(`   ⚠️  NOT FOUND: ${item.file}`);
            fail++;
            continue;
        }

        const sanitized = sanitizeFilename(item.file);
        const storagePath = `Spanish/Level1/${sanitized}`;
        const fileBuffer = fs.readFileSync(fullPath);

        process.stdout.write(`   ⬆️  ${item.display_name}... `);

        const { error: uploadErr } = await supabase.storage
            .from('training-materials')
            .upload(storagePath, fileBuffer, {
                contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                upsert: true
            });

        if (uploadErr) {
            console.log(`STORAGE FAILED (${uploadErr.message})`);
            fail++;
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
            console.log(`UPLOAD OK, DB FAILED (${dbErr.message})`);
            fail++;
        } else {
            console.log('✅');
            ok++;
        }
    }

    console.log('\n=== Summary ===');
    console.log(`✅ Uploaded: ${ok}  ❌ Failed: ${fail}`);

    const { data: final } = await (supabase as any)
        .from('training_materials')
        .select('file_path');
    const spanishCount = (final || []).filter((r: any) => r.file_path?.startsWith('Spanish/')).length;
    const totalCount = (final || []).length;
    console.log(`\n📊 DB total: ${totalCount} records  (${spanishCount} Spanish / ${totalCount - spanishCount} English)`);
    console.log('\n🏁 Done! Switch language to Español in the app to see the materials.');
}

main().catch(console.error);
