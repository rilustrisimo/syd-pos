'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getDashboardStats,
  getSalesTrend,
  getTopProducts,
  getHourlySales,
  getLowStockItems,
  getRecentTransactions,
  getSalesByProduct,
  getSalesByCategory,
  getSupplierPurchaseHistory,
  getDemandForecast,
  SalesReportFilters,
  SupplierHistoryFilters,
  DemandForecastFilters,
} from '@/lib/supabase/queries/dashboard'

// Query keys
export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
  salesTrend: (days: number) => [...dashboardKeys.all, 'sales-trend', days] as const,
  topProducts: (days: number) => [...dashboardKeys.all, 'top-products', days] as const,
  hourlySales: () => [...dashboardKeys.all, 'hourly-sales'] as const,
  lowStock: () => [...dashboardKeys.all, 'low-stock'] as const,
  recentTransactions: () => [...dashboardKeys.all, 'recent-transactions'] as const,
}

// Hook to get dashboard statistics
export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => getDashboardStats(),
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Refetch every minute
  })
}

// Hook to get sales trend
export function useSalesTrend(days: number = 30) {
  return useQuery({
    queryKey: dashboardKeys.salesTrend(days),
    queryFn: () => getSalesTrend(days),
    staleTime: 300000, // 5 minutes
  })
}

// Hook to get top products
export function useTopProducts(days: number = 7) {
  return useQuery({
    queryKey: dashboardKeys.topProducts(days),
    queryFn: () => getTopProducts(days),
    staleTime: 300000, // 5 minutes
  })
}

// Hook to get hourly sales
export function useHourlySales() {
  return useQuery({
    queryKey: dashboardKeys.hourlySales(),
    queryFn: () => getHourlySales(),
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Refetch every minute
  })
}

// Hook to get low stock items
export function useLowStockItems() {
  return useQuery({
    queryKey: dashboardKeys.lowStock(),
    queryFn: () => getLowStockItems(),
    staleTime: 300000, // 5 minutes
  })
}

// Hook to get recent transactions
export function useRecentTransactions() {
  return useQuery({
    queryKey: dashboardKeys.recentTransactions(),
    queryFn: () => getRecentTransactions(),
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

// ============================================
// SALES REPORTS
// ============================================

// Hook to get sales by product report
export function useSalesByProduct(filters: SalesReportFilters = {}) {
  return useQuery({
    queryKey: [...dashboardKeys.all, 'sales-by-product', filters],
    queryFn: () => getSalesByProduct(filters),
    staleTime: 300000, // 5 minutes
  })
}

// Hook to get sales by category report
export function useSalesByCategory(filters: SalesReportFilters = {}) {
  return useQuery({
    queryKey: [...dashboardKeys.all, 'sales-by-category', filters],
    queryFn: () => getSalesByCategory(filters),
    staleTime: 300000, // 5 minutes
  })
}

// ============================================
// SUPPLIER PURCHASE HISTORY
// ============================================

export function useSupplierPurchaseHistory(filters: SupplierHistoryFilters = {}) {
  return useQuery({
    queryKey: [...dashboardKeys.all, 'supplier-history', filters],
    queryFn: () => getSupplierPurchaseHistory(filters),
    staleTime: 300000, // 5 minutes
  })
}

// ============================================
// DEMAND FORECAST
// ============================================

export function useDemandForecast(filters: DemandForecastFilters = {}) {
  return useQuery({
    queryKey: [...dashboardKeys.all, 'demand-forecast', filters],
    queryFn: () => getDemandForecast(filters),
    staleTime: 300000, // 5 minutes
  })
}
