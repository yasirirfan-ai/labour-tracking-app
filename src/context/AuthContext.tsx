import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string, requiredRole?: 'manager' | 'employee') => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedUser = localStorage.getItem('bt_user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    const login = async (username: string, password: string, requiredRole?: 'manager' | 'employee'): Promise<{ success: boolean; error?: string }> => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();

        if (error || !data) {
            return { success: false, error: 'Invalid username or password' };
        }

        if (requiredRole && (data as any).role !== requiredRole) {
            const portalName = requiredRole === 'manager' ? 'Admin' : 'Worker';
            return { success: false, error: `Access Denied: This account is not authorized for ${portalName} Portal` };
        }

        if ((data as any).role !== 'manager' && (data as any).role !== 'employee') {
            return { success: false, error: 'Access denied. Invalid user role.' };
        }

        const userData = data as any as User;
        setUser(userData);
        localStorage.setItem('bt_user', JSON.stringify(userData));
        return { success: true };
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('bt_user');
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
