import { Product, ProductCategory } from '../types';
export declare const useProducts: (options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Product[], Error>;
export declare const useSearchProducts: (query: string, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Product[], Error>;
export declare const useProduct: (id: string | undefined, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Product | null, Error>;
export declare const useProductsByCategory: (categoryId: string | undefined, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Product[], Error>;
export declare const useProductCategories: (options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Pick<ProductCategory, "id" | "name">[], Error>;
export declare const useUpsertProduct: () => import("@tanstack/react-query").UseMutationResult<any, Error, Partial<Product>, unknown>;
export default useProducts;
//# sourceMappingURL=useProducts.d.ts.map