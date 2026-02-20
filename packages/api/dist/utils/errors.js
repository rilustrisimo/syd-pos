import { ApiError } from '../types';
export const mapSupabaseError = (error) => {
    const message = error?.message || error?.details || 'Unknown error occurred';
    const code = error?.code || 'UNKNOWN_ERROR';
    if (code === '23505' || message.includes('duplicate key')) {
        return new ApiError('DUPLICATE_ENTRY', 'This record already exists', 409);
    }
    if (code === '23503' || message.includes('foreign key')) {
        return new ApiError('FOREIGN_KEY_ERROR', 'Referenced record not found', 400);
    }
    if (code === '42P01' || message.includes('does not exist')) {
        return new ApiError('NOT_FOUND', 'Resource not found', 404);
    }
    if (code === 'PGRST116' || message.includes('No rows')) {
        return new ApiError('NOT_FOUND', 'Resource not found', 404);
    }
    if (code === 'FETCH_FAILED') {
        return new ApiError('NETWORK_ERROR', 'Failed to connect to server', 503);
    }
    return new ApiError('DATABASE_ERROR', message, 500);
};
export const toApiError = (error) => {
    if (error instanceof ApiError) {
        return error;
    }
    if (error?.message) {
        if (error.code || error.details) {
            return mapSupabaseError(error);
        }
        return new ApiError('ERROR', error.message, 500);
    }
    return new ApiError('UNKNOWN_ERROR', 'An unexpected error occurred', 500);
};
export const getErrorResponse = (error) => {
    const apiError = toApiError(error);
    return {
        code: apiError.code,
        error: apiError.message,
        details: { timestamp: new Date().toISOString() },
    };
};
export const isNetworkError = (error) => {
    const apiError = toApiError(error);
    return apiError.code === 'NETWORK_ERROR' || apiError.statusCode === 503;
};
export const isNotFoundError = (error) => {
    const apiError = toApiError(error);
    return apiError.code === 'NOT_FOUND' || apiError.statusCode === 404;
};
export const isAuthError = (error) => {
    const apiError = toApiError(error);
    return apiError.statusCode === 401 || error?.code === '401';
};
export const isValidationError = (error) => {
    const apiError = toApiError(error);
    return apiError.statusCode === 400 && apiError.code !== 'FOREIGN_KEY_ERROR';
};
export const handleAsync = async (fn) => {
    try {
        const data = await fn();
        return { data, error: null };
    }
    catch (err) {
        return { data: null, error: toApiError(err) };
    }
};
export const retryAsync = async (fn, maxRetries = 3, delayMs = 1000) => {
    let lastError = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (i < maxRetries - 1) {
                await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, i)));
            }
        }
    }
    throw lastError;
};
export const formatErrorMessage = (error) => {
    const apiError = toApiError(error);
    const messages = {
        DUPLICATE_ENTRY: 'This record already exists',
        NOT_FOUND: 'The requested item was not found',
        NETWORK_ERROR: 'Connection error. Please check your internet and try again.',
        UNKNOWN_ERROR: 'Something went wrong. Please try again.',
        FOREIGN_KEY_ERROR: 'Cannot delete this item as it is referenced elsewhere',
        DATABASE_ERROR: 'Database error. Please try again.',
    };
    return messages[apiError.code] || apiError.message;
};
export const logError = (error, context) => {
    const apiError = toApiError(error);
    console.error(`[${context || 'Error'}]`, {
        code: apiError.code,
        message: apiError.message,
        statusCode: apiError.statusCode,
        originalError: error,
    });
};
export default {
    mapSupabaseError,
    toApiError,
    getErrorResponse,
    isNetworkError,
    isNotFoundError,
    isAuthError,
    isValidationError,
    handleAsync,
    retryAsync,
    formatErrorMessage,
    logError,
};
//# sourceMappingURL=errors.js.map