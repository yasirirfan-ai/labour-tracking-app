
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SPANISH_DIR = 'C:/Users/ESHOP/Downloads/Spanish/Spanish';

const spanishFiles = [
    {
        name: 'Personnel and Training',
        file: 'Personal y Capacitación 3.4-2 - Training Material rev.101424.pdf',
        level: 1,
        category: 'Personnel and Training'
    },
    {
        name: 'Visitor Policy',
        file: 'Política de Visitantes - Training Material rev.101124.pdf',
        level: 1,
        category: 'Visitor Policy'
    },
    {
        name: 'Gowning, Hand washing and Conduct',
        file: 'Vestimenta, Lavado de Manos y Conducta 3.5.2 - Training Material rev.101424.pdf',
        level: 1,
        category: 'Gowning, Hand washing and Conduct'
    },
    {
        name: 'Premises Cleaning and Sanitation',
        file: 'Limpieza y Saneamiento de Instalaciones 4.10.0 - Training Material rev.101424.pdf',
        level: 1,
        category: 'Premises Cleaning and Sanitation'
    },
    {
        name: 'Pest Control',
        file: 'Control de Plagas 4.13 - Training Material rev101524.pdf',
        level: 1,
        category: 'Pest Control'
    },
    {
        name: 'Biohazard Response',
        file: 'Respuesta a Material Biológico Peligroso - Training Material rev.101124.pdf',
        level: 1,
        category: 'Biohazard Response'
    },
    {
        name: 'GMP Training Presentation',
        file: 'Buenas Prácticas de Manufactura (BPM) _updated_10152024.pdf',
        level: 1,
        category: 'GMP Training Presentation'
    }
];

async function uploadSpanishTrainings() {
    console.log('🔄 Starting Spanish training materials upload...');

    for (const item of spanishFiles) {
        const fullPath = path.join(SPANISH_DIR, item.file);
        if (!fs.existsSync(fullPath)) {
            console.error(`❌ File not found: ${fullPath}`);
            continue;
        }

        const fileBuffer = fs.readFileSync(fullPath);
        const storagePath = `Spanish/Level1/${item.file}`;

        console.log(`⬆️ Uploading ${item.name} (${item.file})...`);
        
        const { error: uploadError } = await supabase.storage
            .from('training-materials')
            .upload(storagePath, fileBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            console.error(`❌ Upload failed for ${item.name}:`, uploadError.message);
            continue;
        }

        console.log(`✅ Uploaded. Registering in database...`);

        const { error: dbError } = await (supabase as any)
            .from('training_materials')
            .insert({
                level: item.level,
                category: item.category,
                display_name: item.name,
                file_path: storagePath,
                language: 'es'
            });

        if (dbError) {
            console.error(`❌ DB Insert failed for ${item.name}:`, dbError.message);
        } else {
            console.log(`✅ Successfully registered ${item.name}`);
        }
    }

    console.log('🏁 Spanish upload complete.');
}

uploadSpanishTrainings();
