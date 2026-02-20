import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getCurrentUser, login, logout, signup } from '../supabase';
const AUTH_QUERY_KEY = ['auth'];
export const useAuth = () => {
    return useQuery({
        queryKey: AUTH_QUERY_KEY,
        queryFn: async () => {
            const user = await getCurrentUser();
            if (!user) {
                return null;
            }
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();
            if (error) {
                console.error('Error fetching user profile:', error);
                return null;
            }
            return {
                id: user.id,
                email: user.email || '',
                branch_id: data?.branch_id || null,
                role: data?.role || 'cashier',
                full_name: data?.full_name || '',
                is_active: data?.is_active,
            };
        },
        retry: false,
        staleTime: 1000 * 60 * 5,
    });
};
export const useLogin = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ email, password }) => {
            return login(email, password);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
        },
        onError: (error) => {
            console.error('Login failed:', error);
            throw error;
        },
    });
};
export const useLogout = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: logout,
        onSuccess: () => {
            queryClient.clear();
        },
        onError: (error) => {
            console.error('Logout failed:', error);
            throw error;
        },
    });
};
export const useSignup = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ email, password }) => {
            return signup(email, password);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
        },
        onError: (error) => {
            console.error('Signup failed:', error);
            throw error;
        },
    });
};
export const useAuthStateChange = (callback) => {
    const { data: user } = useAuth();
    React.useEffect(() => {
        const { data: listener } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
                callback(user || null);
            }
        });
        return () => {
            listener?.subscription.unsubscribe();
        };
    }, [user, callback]);
};
export default useAuth;
//# sourceMappingURL=useAuth.js.map