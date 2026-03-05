import { Transaction, CreateTransactionPayload } from '../types';
export declare const useTransactions: (page?: number, limit?: number, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<{
    data: Transaction[];
    total: number;
    page: number;
    limit: number;
}, Error>;
export declare const useSearchTransactions: (query: string, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<Transaction[], Error>;
export declare const useTransaction: (id: string | undefined) => import("@tanstack/react-query").UseQueryResult<Transaction | null, Error>;
export declare const useCreateTransaction: () => import("@tanstack/react-query").UseMutationResult<Transaction, Error, CreateTransactionPayload, unknown>;
export declare const useDeleteTransaction: () => import("@tanstack/react-query").UseMutationResult<void, Error, string, unknown>;
export declare const useCustomerTransactions: (customerId: string | undefined) => import("@tanstack/react-query").UseQueryResult<Transaction[], Error>;
export default useTransactions;
//# sourceMappingURL=useTransactions.d.ts.map