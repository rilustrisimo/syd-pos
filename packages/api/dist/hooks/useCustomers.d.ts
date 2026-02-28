import { Customer } from '../types';
export declare const useCustomers: (options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Customer[], Error>;
export declare const useSearchCustomers: (query: string, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Customer[], Error>;
export declare const useCustomer: (id: string | undefined, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Customer | null, Error>;
export declare const useWalkInCustomer: (options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Customer, Error>;
export declare const useUpsertCustomer: () => import("@tanstack/react-query").UseMutationResult<Customer, Error, Partial<Customer>, unknown>;
export declare const useDeleteCustomer: () => import("@tanstack/react-query").UseMutationResult<void, Error, string, unknown>;
export default useCustomers;
//# sourceMappingURL=useCustomers.d.ts.map