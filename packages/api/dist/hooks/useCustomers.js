import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
const CUSTOMERS_QUERY_KEY = ['customers'];
export const useCustomers = (options) => {
    return useQuery({
        queryKey: CUSTOMERS_QUERY_KEY,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('is_active', true)
                .order('name');
            if (error) {
                throw new Error(`Failed to fetch customers: ${error.message}`);
            }
            return (data || []);
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60,
        enabled: options?.enabled !== false,
        retry: 2,
    });
};
export const useSearchCustomers = (query, options) => {
    return useQuery({
        queryKey: [CUSTOMERS_QUERY_KEY, 'search', query],
        queryFn: async () => {
            if (!query.trim()) {
                return [];
            }
            const searchTerm = `%${query}%`;
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('is_active', true)
                .or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},email.ilike.${searchTerm}`)
                .limit(20);
            if (error) {
                throw new Error(`Failed to search customers: ${error.message}`);
            }
            return (data || []);
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        enabled: options?.enabled !== false && query.trim().length > 0,
        retry: 2,
    });
};
export const useCustomer = (id, options) => {
    return useQuery({
        queryKey: [CUSTOMERS_QUERY_KEY, id],
        queryFn: async () => {
            if (!id) {
                return null;
            }
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('id', id)
                .single();
            if (error) {
                throw new Error(`Failed to fetch customer: ${error.message}`);
            }
            return data;
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60,
        enabled: options?.enabled !== false && !!id,
        retry: 2,
    });
};
export const useWalkInCustomer = (options) => {
    return useQuery({
        queryKey: [...CUSTOMERS_QUERY_KEY, 'walk-in'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('name', 'Walk-in Customer')
                .eq('is_active', true)
                .maybeSingle();
            if (error) {
                throw new Error(`Failed to fetch walk-in customer: ${error.message}`);
            }
            if (data)
                return data;
            const { data: created, error: createError } = await supabase
                .from('customers')
                .insert([{
                    name: 'Walk-in Customer',
                    customer_type: 'cash',
                    is_active: true,
                    credit_limit: 0,
                    outstanding_balance: 0,
                }])
                .select()
                .single();
            if (createError) {
                throw new Error(`Failed to create walk-in customer: ${createError.message}`);
            }
            return created;
        },
        staleTime: 1000 * 60 * 30,
        gcTime: 1000 * 60 * 60,
        enabled: options?.enabled !== false,
        retry: 2,
    });
};
export const useUpsertCustomer = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (customer) => {
            if (customer.id) {
                const { data, error } = await supabase
                    .from('customers')
                    .update(customer)
                    .eq('id', customer.id)
                    .select()
                    .single();
                if (error) {
                    throw new Error(`Failed to update customer: ${error.message}`);
                }
                return data;
            }
            else {
                const { data, error } = await supabase
                    .from('customers')
                    .insert([customer])
                    .select()
                    .single();
                if (error) {
                    throw new Error(`Failed to create customer: ${error.message}`);
                }
                return data;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
        },
    });
};
export const useDeleteCustomer = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const { error } = await supabase
                .from('customers')
                .update({ is_active: false })
                .eq('id', id);
            if (error) {
                throw new Error(`Failed to delete customer: ${error.message}`);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
        },
    });
};
export default useCustomers;
//# sourceMappingURL=useCustomers.js.map