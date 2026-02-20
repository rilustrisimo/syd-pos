import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
const PRODUCTS_QUERY_KEY = ['products'];
export const useProducts = (options) => {
    return useQuery({
        queryKey: PRODUCTS_QUERY_KEY,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('products')
                .select(`
          *,
          category:product_categories(id, name),
          subcategory:product_subcategories(id, name),
          variants:product_variants(*)
        `)
                .eq('is_active', true)
                .order('name');
            if (error) {
                throw new Error(`Failed to fetch products: ${error.message}`);
            }
            return (data || []);
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60,
        enabled: options?.enabled !== false,
        retry: 2,
    });
};
export const useSearchProducts = (query, options) => {
    return useQuery({
        queryKey: [PRODUCTS_QUERY_KEY, 'search', query],
        queryFn: async () => {
            if (!query.trim()) {
                return [];
            }
            const searchTerm = `%${query}%`;
            const { data, error } = await supabase
                .from('products')
                .select(`
          *,
          category:product_categories(id, name),
          subcategory:product_subcategories(id, name),
          variants:product_variants(*)
        `)
                .eq('is_active', true)
                .or(`name.ilike.${searchTerm},code.ilike.${searchTerm}`)
                .limit(20);
            if (error) {
                throw new Error(`Failed to search products: ${error.message}`);
            }
            return (data || []);
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        enabled: options?.enabled !== false && query.trim().length > 0,
        retry: 2,
    });
};
export const useProduct = (id, options) => {
    return useQuery({
        queryKey: [PRODUCTS_QUERY_KEY, id],
        queryFn: async () => {
            if (!id) {
                return null;
            }
            const { data, error } = await supabase
                .from('products')
                .select(`
          *,
          category:product_categories(id, name),
          subcategory:product_subcategories(id, name),
          variants:product_variants(*)
        `)
                .eq('id', id)
                .single();
            if (error) {
                throw new Error(`Failed to fetch product: ${error.message}`);
            }
            return data;
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60,
        enabled: options?.enabled !== false && !!id,
        retry: 2,
    });
};
export const useProductsByCategory = (categoryId, options) => {
    return useQuery({
        queryKey: [PRODUCTS_QUERY_KEY, 'category', categoryId],
        queryFn: async () => {
            if (!categoryId) {
                return [];
            }
            const { data, error } = await supabase
                .from('products')
                .select(`
          *,
          category:product_categories(id, name),
          subcategory:product_subcategories(id, name),
          variants:product_variants(*)
        `)
                .eq('category_id', categoryId)
                .eq('is_active', true)
                .order('name');
            if (error) {
                throw new Error(`Failed to fetch products: ${error.message}`);
            }
            return (data || []);
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60,
        enabled: options?.enabled !== false && !!categoryId,
        retry: 2,
    });
};
export const useUpsertProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (product) => {
            if (product.id) {
                const { error } = await supabase
                    .from('products')
                    .update(product)
                    .eq('id', product.id);
                if (error) {
                    throw new Error(`Failed to update product: ${error.message}`);
                }
                return product;
            }
            else {
                const { data, error } = await supabase.from('products').insert([product]).select().single();
                if (error) {
                    throw new Error(`Failed to create product: ${error.message}`);
                }
                return data;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
        },
    });
};
export default useProducts;
//# sourceMappingURL=useProducts.js.map