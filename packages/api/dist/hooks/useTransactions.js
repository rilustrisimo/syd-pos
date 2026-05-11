import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
const TRANSACTIONS_QUERY_KEY = ['transactions'];
export const useTransactions = (page = 1, limit = 20, options) => {
    const offset = (page - 1) * limit;
    return useQuery({
        queryKey: [TRANSACTIONS_QUERY_KEY, 'list', page, limit],
        queryFn: async () => {
            const { data, error, count } = await supabase
                .from('transactions')
                .select(`
          *,
          customer:customers(*),
          lines:transaction_lines(*, product:products(id, code, name), uom:units_of_measure(id, name, code)),
          payments:transaction_payments(*)
        `, { count: 'exact' })
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) {
                throw new Error(`Failed to fetch transactions: ${error.message}`);
            }
            return {
                data: (data || []),
                total: count || 0,
                page,
                limit,
            };
        },
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 10,
        enabled: options?.enabled !== false,
        retry: 2,
    });
};
export const useSearchTransactions = (query, options) => {
    return useQuery({
        queryKey: [TRANSACTIONS_QUERY_KEY, 'search', query],
        queryFn: async () => {
            if (!query.trim()) {
                return [];
            }
            const searchTerm = `%${query}%`;
            const { data, error } = await supabase
                .from('transactions')
                .select(`
          *,
          customer:customers(*),
          lines:transaction_lines(*, product:products(id, code, name), uom:units_of_measure(id, name, code)),
          payments:transaction_payments(*)
        `)
                .eq('is_deleted', false)
                .or(`transaction_number.ilike.${searchTerm},customer.name.ilike.${searchTerm}`)
                .limit(20);
            if (error) {
                throw new Error(`Failed to search transactions: ${error.message}`);
            }
            return (data || []);
        },
        staleTime: 1000 * 60,
        gcTime: 1000 * 60 * 5,
        enabled: options?.enabled !== false && query.trim().length > 0,
        retry: 1,
    });
};
export const useTransaction = (id) => {
    return useQuery({
        queryKey: [TRANSACTIONS_QUERY_KEY, id],
        queryFn: async () => {
            if (!id) {
                return null;
            }
            const { data, error } = await supabase
                .from('transactions')
                .select(`
          *,
          customer:customers(*),
          lines:transaction_lines(*, product:products(id, code, name), uom:units_of_measure(id, name, code)),
          payments:transaction_payments(*)
        `)
                .eq('id', id)
                .single();
            if (error) {
                throw new Error(`Failed to fetch transaction: ${error.message}`);
            }
            return data;
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        enabled: !!id,
        retry: 2,
    });
};
export const useCreateTransaction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const input = payload.input;
            const { data, error } = await supabase.rpc('create_transaction_atomic', {
                p_branch_id: input.branch_id,
                p_customer_id: input.customer_id,
                p_transaction_type: input.transaction_type,
                p_delivery_type: input.delivery_type,
                p_delivery_address: input.delivery_address ?? null,
                p_delivery_phone: input.delivery_phone ?? null,
                p_notes: input.notes ?? null,
                p_subtotal: input.subtotal,
                p_discount_amount: input.discount_amount,
                p_delivery_fee: input.delivery_fee ?? 0,
                p_other_fees: input.other_fees ?? 0,
                p_other_fees_notes: input.other_fees_notes ?? null,
                p_transaction_date: input.transaction_date ?? new Date().toISOString(),
                p_total_amount: input.total_amount,
                p_amount_paid: input.amount_paid,
                p_payment_status: input.payment_status,
                p_created_by: payload.userId,
                p_lines: payload.lines.map((line) => ({
                    product_id: line.product_id,
                    variant_id: line.variant_id ?? null,
                    quantity: line.quantity,
                    uom_id: line.uom_id,
                    unit_price: line.unit_price,
                    cogs_per_unit: line.cogs_per_unit,
                    discount_amount: line.discount_amount ?? 0,
                })),
                p_payments: payload.payments.map((payment) => ({
                    payment_method: payment.payment_method,
                    amount: payment.amount,
                    reference_number: payment.reference_number ?? null,
                })),
            });
            if (error) {
                throw new Error(`Failed to create transaction: ${error.message}`);
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
        },
    });
};
export const useDeleteTransaction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const { error } = await supabase
                .from('transactions')
                .delete()
                .eq('id', id);
            if (error) {
                throw new Error(`Failed to delete transaction: ${error.message}`);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
        },
    });
};
export const useCustomerTransactions = (customerId) => {
    return useQuery({
        queryKey: [TRANSACTIONS_QUERY_KEY, 'customer', customerId],
        queryFn: async () => {
            if (!customerId) {
                return [];
            }
            const { data, error } = await supabase
                .from('transactions')
                .select(`
          *,
          customer:customers(*),
          lines:transaction_lines(*, product:products(id, code, name), uom:units_of_measure(id, name, code)),
          payments:transaction_payments(*)
        `)
                .eq('customer_id', customerId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });
            if (error) {
                throw new Error(`Failed to fetch customer transactions: ${error.message}`);
            }
            return (data || []);
        },
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 10,
        enabled: !!customerId,
        retry: 2,
    });
};
export default useTransactions;
//# sourceMappingURL=useTransactions.js.map