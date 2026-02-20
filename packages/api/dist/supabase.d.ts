export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const createSupabaseClient: (url: string, anonKey: string) => import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const isAuthenticated: () => Promise<boolean>;
export declare const getCurrentUser: () => Promise<import("@supabase/supabase-js").AuthUser | null>;
export declare const getCurrentSession: () => Promise<import("@supabase/supabase-js").AuthSession | null>;
export declare const login: (email: string, password: string) => Promise<{
    user: import("@supabase/supabase-js").AuthUser;
    session: import("@supabase/supabase-js").AuthSession;
    weakPassword?: import("@supabase/supabase-js").WeakPassword;
}>;
export declare const logout: () => Promise<void>;
export declare const signup: (email: string, password: string) => Promise<{
    user: import("@supabase/supabase-js").AuthUser | null;
    session: import("@supabase/supabase-js").AuthSession | null;
}>;
export default supabase;
//# sourceMappingURL=supabase.d.ts.map