import { supabase } from './supabase';

export interface TrainingMaterial {
    id: string;
    level: number;
    department: string | null;
    category: string;
    display_name: string;
    file_path: string;
    created_at: string;
}

export const trainingService = {
    async getAllMaterials(): Promise<TrainingMaterial[]> {
        const { data, error } = await supabase
            .from('training_materials')
            .select('*')
            .order('level', { ascending: true })
            .order('category', { ascending: true });

        if (error) {
            console.error('Error fetching training materials:', error);
            return [];
        }
        return data || [];
    },

    async getMaterialsByLevel(level: number): Promise<TrainingMaterial[]> {
        const { data, error } = await supabase
            .from('training_materials')
            .select('*')
            .eq('level', level)
            .order('category', { ascending: true });

        if (error) {
            console.error(`Error fetching Level ${level} materials:`, error);
            return [];
        }
        return data || [];
    },

    getPublicUrl(filePath: string): string {
        const { data } = supabase.storage
            .from('training-materials')
            .getPublicUrl(filePath);
        return data.publicUrl;
    }
};
