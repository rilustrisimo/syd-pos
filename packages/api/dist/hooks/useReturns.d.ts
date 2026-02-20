import { CreateReturnPayload } from '../types';
export declare const useReturns: (page?: number, limit?: number, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<{
    data: any[];
    total: number;
    page: number;
    limit: number;
}, Error>;
export declare const useSearchReturns: (query: string, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<any[], Error>;
export declare const useReturn: (id: string | undefined) => import("@tanstack/react-query").UseQueryResult<any, Error>;
export declare const useTransactionReturns: (transactionId: string | undefined) => import("@tanstack/react-query").UseQueryResult<any[], Error>;
export declare const useCreateReturn: () => import("@tanstack/react-query").UseMutationResult<any, Error, CreateReturnPayload, unknown>;
export declare const useProcessReturn: () => import("@tanstack/react-query").UseMutationResult<any, Error, {
    returnId: string;
    refundMethod: string;
    refundAmount: number;
    referenceNumber?: string;
}, unknown>;
export declare const useDeleteReturn: () => import("@tanstack/react-query").UseMutationResult<void, Error, string, unknown>;
export default useReturns;
//# sourceMappingURL=useReturns.d.ts.map