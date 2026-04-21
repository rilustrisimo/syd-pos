'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getEmployees,
  getEmployee,
  getEmployeeStats,
  generateEmployeeNumber,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getAttendance,
  bulkUpsertAttendance,
  getPayrollRuns,
  getPayrollRun,
  getEmployeePayrollLines,
  createPayrollRun,
  updatePayrollLine,
  finalizePayrollRun,
  payPayrollRun,
  getCashAdvances,
  createCashAdvance,
  getAllEmployeeStats,
} from '@/lib/supabase/queries/employees'
import type { CreateEmployeeInput, UpdateEmployeeInput, AttendanceRow } from '@/lib/supabase/queries/employees'

// ── Query keys ─────────────────────────────────────────────────────────────────

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (params: any) => [...employeeKeys.lists(), params] as const,
  detail: (id: string) => [...employeeKeys.all, 'detail', id] as const,
  stats: (id: string) => [...employeeKeys.all, 'stats', id] as const,
  allStats: () => [...employeeKeys.all, 'all-stats'] as const,
  attendance: (id: string, start: string, end: string) =>
    [...employeeKeys.all, 'attendance', id, start, end] as const,
  payrollRuns: (params?: any) => ['payroll-runs', params] as const,
  payrollRun: (id: string) => ['payroll-runs', 'detail', id] as const,
  employeePayrollLines: (id: string) => [...employeeKeys.all, 'payroll-lines', id] as const,
  cashAdvances: (id: string) => [...employeeKeys.all, 'cash-advances', id] as const,
}

// ── Employee queries ───────────────────────────────────────────────────────────

export function useEmployees(params?: { search?: string; status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: () => getEmployees(params),
    staleTime: 60_000,
  })
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: () => getEmployee(id),
    enabled: !!id,
  })
}

export function useEmployeeStats(id: string) {
  return useQuery({
    queryKey: employeeKeys.stats(id),
    queryFn: () => getEmployeeStats(id),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function useAllEmployeeStats() {
  return useQuery({
    queryKey: employeeKeys.allStats(),
    queryFn: getAllEmployeeStats,
    staleTime: 60_000,
  })
}

export function useGenerateEmployeeNumber() {
  return useQuery({
    queryKey: ['employee-number-generate'],
    queryFn: generateEmployeeNumber,
    staleTime: 0,
  })
}

// ── Employee mutations ─────────────────────────────────────────────────────────

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.all })
      queryClient.invalidateQueries({ queryKey: ['employee-number-generate'] })
    },
  })
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEmployeeInput }) =>
      updateEmployee(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.all })
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(id) })
    },
  })
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.all })
    },
  })
}

// ── Attendance ─────────────────────────────────────────────────────────────────

export function useAttendance(employeeId: string, startDate: string, endDate: string) {
  return useQuery({
    queryKey: employeeKeys.attendance(employeeId, startDate, endDate),
    queryFn: () => getAttendance(employeeId, startDate, endDate),
    enabled: !!employeeId && !!startDate && !!endDate,
  })
}

export function useBulkUpsertAttendance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rows: Parameters<typeof bulkUpsertAttendance>[0]) =>
      bulkUpsertAttendance(rows),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.all })
    },
  })
}

// ── Payroll Runs ───────────────────────────────────────────────────────────────

export function usePayrollRuns(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: employeeKeys.payrollRuns(params),
    queryFn: () => getPayrollRuns(params),
    staleTime: 30_000,
  })
}

export function usePayrollRun(id: string) {
  return useQuery({
    queryKey: employeeKeys.payrollRun(id),
    queryFn: () => getPayrollRun(id),
    enabled: !!id,
  })
}

export function useEmployeePayrollLines(employeeId: string) {
  return useQuery({
    queryKey: employeeKeys.employeePayrollLines(employeeId),
    queryFn: () => getEmployeePayrollLines(employeeId),
    enabled: !!employeeId,
    staleTime: 30_000,
  })
}

export function useCreatePayrollRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      periodStart,
      periodEnd,
      userId,
    }: {
      periodStart: string
      periodEnd: string
      userId: string
    }) => createPayrollRun(periodStart, periodEnd, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] })
      queryClient.invalidateQueries({ queryKey: employeeKeys.all })
    },
  })
}

export function useUpdatePayrollLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      lineId,
      updates,
    }: {
      lineId: string
      updates: Parameters<typeof updatePayrollLine>[1]
    }) => updatePayrollLine(lineId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] })
    },
  })
}

export function useFinalizePayrollRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => finalizePayrollRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] })
    },
  })
}

export function usePayPayrollRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      runId,
      userId,
      branchId,
    }: {
      runId: string
      userId: string
      branchId: string
    }) => payPayrollRun(runId, userId, branchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] })
      queryClient.invalidateQueries({ queryKey: employeeKeys.all })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}

// ── Cash Advances ──────────────────────────────────────────────────────────────

export function useCashAdvances(employeeId: string) {
  return useQuery({
    queryKey: employeeKeys.cashAdvances(employeeId),
    queryFn: () => getCashAdvances(employeeId),
    enabled: !!employeeId,
    staleTime: 30_000,
  })
}

export function useCreateCashAdvance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      employeeId,
      amount,
      reason,
      advanceDate,
      userId,
    }: {
      employeeId: string
      amount: number
      reason: string | null
      advanceDate: string
      userId: string
    }) => createCashAdvance(employeeId, amount, reason, advanceDate, userId),
    onSuccess: (_, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.cashAdvances(employeeId) })
      queryClient.invalidateQueries({ queryKey: employeeKeys.stats(employeeId) })
      queryClient.invalidateQueries({ queryKey: employeeKeys.allStats() })
    },
  })
}
