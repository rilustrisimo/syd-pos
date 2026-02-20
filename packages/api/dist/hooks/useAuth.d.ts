import { AuthUser } from '../types';
export declare const useAuth: () => import("@tanstack/react-query").UseQueryResult<AuthUser | null, Error>;
export declare const useLogin: () => import("@tanstack/react-query").UseMutationResult<{
    user: import("@supabase/auth-js").User;
    session: import("@supabase/auth-js").Session;
    weakPassword?: import("@supabase/auth-js").WeakPassword;
}, Error, {
    email: string;
    password: string;
}, unknown>;
export declare const useLogout: () => import("@tanstack/react-query").UseMutationResult<void, Error, void, unknown>;
export declare const useSignup: () => import("@tanstack/react-query").UseMutationResult<{
    user: import("@supabase/auth-js").User | null;
    session: import("@supabase/auth-js").Session | null;
}, Error, {
    email: string;
    password: string;
}, unknown>;
export declare const useAuthStateChange: (callback: (user: AuthUser | null) => void) => void;
export default useAuth;
//# sourceMappingURL=useAuth.d.ts.map