import { supabase } from './supabase';

export interface TrainingMaterial {
    id: string;
    level: number;
    department: string | null;
    category: string;
    display_name: string;
    file_path: string;
    language: string;
    created_at: string;
}

export const trainingService = {
    async getAllMaterials(language: string = 'en'): Promise<TrainingMaterial[]> {
        const { data, error } = await supabase
            .from('training_materials')
            .select('*')
            .order('level', { ascending: true })
            .order('category', { ascending: true });

        if (error) {
            console.error('Error fetching training materials:', error);
            return [];
        }

        const all = (data || []) as TrainingMaterial[];

        // Filter by language using file_path prefix since the language
        // column may not exist in all environments yet.
        // Spanish PDFs are stored under 'Spanish/' in the bucket.
        if (language === 'es') {
            return all.filter(m =>
                m.file_path.startsWith('Spanish/') ||
                m.language === 'es'
            );
        }

        // English: materials NOT in the Spanish folder
        return all.filter(m =>
            !m.file_path.startsWith('Spanish/') &&
            m.language !== 'es'
        );
    },

    async getMaterialsByLevel(level: number, language: string = 'en'): Promise<TrainingMaterial[]> {
        const all = await trainingService.getAllMaterials(language);
        return all.filter(m => m.level === level);
    },

    getPublicUrl(filePath: string): string {
        const { data } = supabase.storage
            .from('training-materials')
            .getPublicUrl(filePath);
        return data.publicUrl;
    }
};

