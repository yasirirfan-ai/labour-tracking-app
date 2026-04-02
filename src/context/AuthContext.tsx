import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    authError: string | null;
    login: (username: string, password: string, requiredRole?: 'manager' | 'employee') => Promise<{ success: boolean; error?: string }>;
    loginWithGoogle: (requiredRole: 'manager' | 'employee') => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        try {
            const savedUser = localStorage.getItem('bt_user');
            if (savedUser) {
                setUser(JSON.parse(savedUser));
            }
        } catch (e) {
            console.error('Failed to parse saved user session, clearing:', e);
            localStorage.removeItem('bt_user');
        }
        setLoading(false);

        // Check for returning Google OAuth session
        const handleGoogleSession = async (session: any) => {
            if (!session?.user?.email) return;

            const googleEmail = session.user.email;
            console.log("Checking for Google Email in database:", googleEmail);

            const pendingRole = localStorage.getItem('bt_pending_role') as 'manager' | 'employee' | null;
            
            // Map the Google user's email to our custom public.users table
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', googleEmail)
                .maybeSingle();

            if (error) {
                console.error("Error querying users table:", error);
                await supabase.auth.signOut();
                setAuthError(`Database Check Failed: ${error.message}`);
                return;
            }

            if (!data) {
                console.log("No matching user found for email:", googleEmail);
                await supabase.auth.signOut();
                setAuthError(`Access Denied: The Google email "${googleEmail}" is not registered in your users table.`);
                return;
            }

            if (pendingRole && (data as any).role !== pendingRole) {
                const portalName = pendingRole === 'manager' ? 'Admin' : 'Worker';
                await supabase.auth.signOut();
                setAuthError(`Access Denied: This account is not authorized for ${portalName} Portal`);
                return;
            }

            if ((data as any).role !== 'manager' && (data as any).role !== 'employee') {
                await supabase.auth.signOut();
                setAuthError("Access denied. Invalid user role.");
                return;
            }

            const userData = data as any as User;
            setUser(userData);
            localStorage.setItem('bt_user', JSON.stringify(userData));
            localStorage.removeItem('bt_pending_role');
        };

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (!savedUser && session) {
                    handleGoogleSession(session);
                }
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
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

    const loginWithGoogle = async (requiredRole: 'manager' | 'employee'): Promise<{ success: boolean; error?: string }> => {
        setAuthError(null);
        localStorage.setItem('bt_pending_role', requiredRole);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) {
            setAuthError(error.message);
            return { success: false, error: error.message };
        }
        return { success: true };
    };

    const logout = async () => {
        setUser(null);
        localStorage.removeItem('bt_user');
        await supabase.auth.signOut();
    };

    const clearAuthError = () => setAuthError(null);

    return (
        <AuthContext.Provider value={{ user, loading, authError, login, loginWithGoogle, logout, clearAuthError }}>
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
