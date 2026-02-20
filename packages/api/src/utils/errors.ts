import { ApiError, ErrorResponse } from '../types'

// Supabase error types are handled dynamically

/**
 * Convert Supabase error to ApiError
 */
export const mapSupabaseError = (error: any): ApiError => {
  const message = error?.message || error?.details || 'Unknown error occurred'
  const code = error?.code || 'UNKNOWN_ERROR'

  // Map common Supabase errors
  if (code === '23505' || message.includes('duplicate key')) {
    return new ApiError('DUPLICATE_ENTRY', 'This record already exists', 409)
  }

  if (code === '23503' || message.includes('foreign key')) {
    return new ApiError('FOREIGN_KEY_ERROR', 'Referenced record not found', 400)
  }

  if (code === '42P01' || message.includes('does not exist')) {
    return new ApiError('NOT_FOUND', 'Resource not found', 404)
  }

  if (code === 'PGRST116' || message.includes('No rows')) {
    return new ApiError('NOT_FOUND', 'Resource not found', 404)
  }

  if (code === 'FETCH_FAILED') {
    return new ApiError('NETWORK_ERROR', 'Failed to connect to server', 503)
  }

  return new ApiError('DATABASE_ERROR', message, 500)
}

/**
 * Convert error to ApiError
 */
export const toApiError = (error: any): ApiError => {
  if (error instanceof ApiError) {
    return error
  }

  if (error?.message) {
    // Check if it's a Supabase error
    if (error.code || error.details) {
      return mapSupabaseError(error)
    }

    // Regular error
    return new ApiError('ERROR', error.message, 500)
  }

  return new ApiError('UNKNOWN_ERROR', 'An unexpected error occurred', 500)
}

/**
 * Get error response object
 */
export const getErrorResponse = (error: any): ErrorResponse => {
  const apiError = toApiError(error)
  return {
    code: apiError.code,
    error: apiError.message,
    details: { timestamp: new Date().toISOString() },
  }
}

/**
 * Is error a network error?
 */
export const isNetworkError = (error: any): boolean => {
  const apiError = toApiError(error)
  return apiError.code === 'NETWORK_ERROR' || apiError.statusCode === 503
}

/**
 * Is error a not found error?
 */
export const isNotFoundError = (error: any): boolean => {
  const apiError = toApiError(error)
  return apiError.code === 'NOT_FOUND' || apiError.statusCode === 404
}

/**
 * Is error an authentication error?
 */
export const isAuthError = (error: any): boolean => {
  const apiError = toApiError(error)
  return apiError.statusCode === 401 || error?.code === '401'
}

/**
 * Is error a validation error?
 */
export const isValidationError = (error: any): boolean => {
  const apiError = toApiError(error)
  return apiError.statusCode === 400 && apiError.code !== 'FOREIGN_KEY_ERROR'
}

/**
 * Handle async function with error handling
 */
export const handleAsync = async <T>(
  fn: () => Promise<T>
): Promise<{ data: T | null; error: ApiError | null }> => {
  try {
    const data = await fn()
    return { data, error: null }
  } catch (err) {
    return { data: null, error: toApiError(err) }
  }
}

/**
 * Retry failed async operation
 */
export const retryAsync = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, i)))
      }
    }
  }

  throw lastError
}

/**
 * Format error for user display
 */
export const formatErrorMessage = (error: any): string => {
  const apiError = toApiError(error)

  // User-friendly error messages
  const messages: Record<string, string> = {
    DUPLICATE_ENTRY: 'This record already exists',
    NOT_FOUND: 'The requested item was not found',
    NETWORK_ERROR: 'Connection error. Please check your internet and try again.',
    UNKNOWN_ERROR: 'Something went wrong. Please try again.',
    FOREIGN_KEY_ERROR: 'Cannot delete this item as it is referenced elsewhere',
    DATABASE_ERROR: 'Database error. Please try again.',
  }

  return messages[apiError.code] || apiError.message
}

/**
 * Log error for debugging
 */
export const logError = (error: any, context?: string) => {
  const apiError = toApiError(error)
  console.error(`[${context || 'Error'}]`, {
    code: apiError.code,
    message: apiError.message,
    statusCode: apiError.statusCode,
    originalError: error,
  })
}

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
}
