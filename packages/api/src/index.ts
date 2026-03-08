// Export all types
export * from './types'

// Export Supabase client
export { supabase, createSupabaseClient, isAuthenticated, getCurrentUser, login, logout, signup } from './supabase'

// Export all hooks
export { useAuth, useLogin, useLogout, useSignup, useAuthStateChange, useBranches } from './hooks/useAuth'
export {
  useProducts,
  useSearchProducts,
  useProduct,
  useProductsByCategory,
  useProductCategories,
  useUpsertProduct,
} from './hooks/useProducts'
export {
  useTransactions,
  useSearchTransactions,
  useTransaction,
  useCreateTransaction,
  useDeleteTransaction,
  useCustomerTransactions,
} from './hooks/useTransactions'
export {
  useCustomers,
  useSearchCustomers,
  useCustomer,
  useUpsertCustomer,
  useWalkInCustomer,
  useDeleteCustomer,
} from './hooks/useCustomers'
export {
  useReturns,
  useSearchReturns,
  useReturn,
  useTransactionReturns,
  useCreateReturn,
  useProcessReturn,
  useDeleteReturn,
} from './hooks/useReturns'
export {
  useCanvases,
  useCanvas,
  useCreateCanvas,
  useUpdateCanvas,
  useDeleteCanvas,
} from './hooks/useCanvases'

// Export formatting utilities
export {
  formatCurrency,
  formatDate,
  formatTime,
  formatDateTime,
  formatNumber,
  formatPercent,
  parseCurrency,
  truncate,
  capitalize,
  formatProductCode,
  formatPhone,
  formatCustomerName,
  getInitials,
  isNumeric,
  isValidEmail,
  isValidPhone,
  formatDuration,
  getRelativeTime,
} from './utils/formatting'

// Export error utilities
export {
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
} from './utils/errors'

// Export validation utilities
export {
  validateTransaction,
  validateTransactionLine,
  validateProduct,
  validateCustomer,
  validateReturn,
  isValidNumber,
  isValidDiscount,
  calculateTransactionTotal,
  isInventorySufficient,
  isValidReturnQuantity,
} from './utils/validation'

// Default export for convenience - most items are exported above
export * as default from './supabase'
