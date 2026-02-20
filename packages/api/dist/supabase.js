import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('⚠️ Supabase credentials not found. Make sure to set SUPABASE_URL and SUPABASE_ANON_KEY');
}
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
});
export const createSupabaseClient = (url, anonKey) => {
    return createClient(url, anonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        },
    });
};
export const isAuthenticated = async () => {
    const { data: { session }, } = await supabase.auth.getSession();
    return !!session;
};
export const getCurrentUser = async () => {
    const { data: { user }, } = await supabase.auth.getUser();
    return user;
};
export const getCurrentSession = async () => {
    const { data: { session }, } = await supabase.auth.getSession();
    return session;
};
export const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
export const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
        throw new Error(error.message);
    }
};
export const signup = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
export default supabase;
//# sourceMappingURL=supabase.js.map