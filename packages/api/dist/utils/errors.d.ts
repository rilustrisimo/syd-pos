import { ApiError, ErrorResponse } from '../types';
export declare const mapSupabaseError: (error: any) => ApiError;
export declare const toApiError: (error: any) => ApiError;
export declare const getErrorResponse: (error: any) => ErrorResponse;
export declare const isNetworkError: (error: any) => boolean;
export declare const isNotFoundError: (error: any) => boolean;
export declare const isAuthError: (error: any) => boolean;
export declare const isValidationError: (error: any) => boolean;
export declare const handleAsync: <T>(fn: () => Promise<T>) => Promise<{
    data: T | null;
    error: ApiError | null;
}>;
export declare const retryAsync: <T>(fn: () => Promise<T>, maxRetries?: number, delayMs?: number) => Promise<T>;
export declare const formatErrorMessage: (error: any) => string;
export declare const logError: (error: any, context?: string) => void;
declare const _default: {
    mapSupabaseError: (error: any) => ApiError;
    toApiError: (error: any) => ApiError;
    getErrorResponse: (error: any) => ErrorResponse;
    isNetworkError: (error: any) => boolean;
    isNotFoundError: (error: any) => boolean;
    isAuthError: (error: any) => boolean;
    isValidationError: (error: any) => boolean;
    handleAsync: <T>(fn: () => Promise<T>) => Promise<{
        data: T | null;
        error: ApiError | null;
    }>;
    retryAsync: <T>(fn: () => Promise<T>, maxRetries?: number, delayMs?: number) => Promise<T>;
    formatErrorMessage: (error: any) => string;
    logError: (error: any, context?: string) => void;
};
export default _default;
//# sourceMappingURL=errors.d.ts.map