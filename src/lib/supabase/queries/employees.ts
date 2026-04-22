import { createClient } from '../client'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Employee {
  id: string
  employee_number: string
  first_name: string
  last_name: string
  middle_name: string | null
  nickname: string | null
  phone: string | null
  address: string | null
  position: string | null
  department: string | null
  employment_type: 'regular' | 'part_time' | 'contractual'
  salary_type: 'daily' | 'weekly' | 'monthly'
  base_rate: number
  overtime_rate: number
  status: 'active' | 'inactive' | 'resigned' | 'terminated'
  hire_date: string | null
  end_date: string | null
  sss_number: string | null
  philhealth_number: string | null
  pagibig_number: string | null
  tin_number: string | null
  bank_name: string | null
  bank_account_number: string | null
  gcash_number: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeStats {
  total_cash_advance_outstanding: number
  payroll_run_count: number
  total_gross_paid: number
  total_net_paid: number
  last_payroll_date: string | null
}

export interface AttendanceRow {
  id: string
  employee_id: string
  attendance_date: string
  status: 'present' | 'absent' | 'half_day' | 'rest_day' | 'holiday'
  time_in: string | null
  time_out: string | null
  regular_hours: number
  overtime_hours: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PayrollRun {
  id: string
  period_start: string
  period_end: string
  label: string | null
  status: 'draft' | 'finalized' | 'paid'
  total_gross: number
  total_deductions: number
  total_net: number
  paid_at: string | null
  created_by: string | null
  expense_id: string | null
  created_at: string
  updated_at: string
  lines?: PayrollLine[]
  line_count?: number
}

export interface PayrollLine {
  id: string
  payroll_run_id: string
  employee_id: string
  days_worked: number
  regular_hours: number
  overtime_hours: number
  basic_pay: number
  overtime_pay: number
  bonuses: number
  adjustments: number
  gross_pay: number
  cash_advance_deduction: number
  sss_deduction: number
  philhealth_deduction: number
  pagibig_deduction: number
  other_deductions: number
  total_deductions: number
  net_pay: number
  bonus_notes: string | null
  adjustment_notes: string | null
  employee?: Pick<Employee, 'id' | 'employee_number' | 'first_name' | 'last_name' | 'position' | 'salary_type' | 'base_rate' | 'overtime_rate'>
}

export interface CashAdvance {
  id: string
  employee_id: string
  amount: number
  reason: string | null
  advance_date: string
  status: 'outstanding' | 'partially_paid' | 'fully_paid'
  amount_remaining: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateEmployeeInput = Omit<Employee, 'id' | 'created_at' | 'updated_at'>
export type UpdateEmployeeInput = Partial<CreateEmployeeInput>

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeBasicPay(employee: Pick<Employee, 'salary_type' | 'base_rate'>, daysWorked: number): number {
  switch (employee.salary_type) {
    case 'daily':
      return daysWorked * employee.base_rate
    case 'weekly':
      return employee.base_rate // weekly rate is per week
    case 'monthly':
      return employee.base_rate / 4.33 // approximate weekly slice
    default:
      return 0
  }
}

// ── Employees CRUD ─────────────────────────────────────────────────────────────

export async function getEmployees(params?: {
  search?: string
  status?: string
  page?: number
  limit?: number
}) {
  const supabase = createClient()
  const { search, status, page = 1, limit = 50 } = params || {}
  const offset = (page - 1) * limit

  let query = supabase
    .from('employees')
    .select('*', { count: 'exact' })
    .order('last_name')
    .order('first_name')
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_number.ilike.%${search}%,position.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(`Failed to fetch employees: ${error.message}`)

  return {
    data: (data || []) as Employee[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

export async function getEmployee(id: string): Promise<Employee> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Failed to fetch employee: ${error.message}`)
  return data as Employee
}

export async function getEmployeeStats(id: string): Promise<EmployeeStats> {
  const supabase = createClient()

  const [advancesRes, payrollRes] = await Promise.all([
    supabase
      .from('employee_cash_advances')
      .select('amount_remaining, status')
      .eq('employee_id', id)
      .neq('status', 'fully_paid'),
    supabase
      .from('employee_payroll_lines')
      .select(`
        gross_pay,
        net_pay,
        payroll_run:employee_payroll_runs!employee_payroll_lines_payroll_run_id_fkey(status, period_end)
      `)
      .eq('employee_id', id),
  ])

  if (advancesRes.error) throw new Error(advancesRes.error.message)
  if (payrollRes.error) throw new Error(payrollRes.error.message)

  const outstanding = ((advancesRes.data as any[]) || []).reduce(
    (sum, r) => sum + Number(r.amount_remaining || 0), 0
  )

  const paidLines = ((payrollRes.data as any[]) || []).filter(
    (l: any) => l.payroll_run?.status === 'paid'
  )

  const totalGross = paidLines.reduce((s: number, l: any) => s + Number(l.gross_pay || 0), 0)
  const totalNet = paidLines.reduce((s: number, l: any) => s + Number(l.net_pay || 0), 0)

  const sortedDates = paidLines
    .map((l: any) => l.payroll_run?.period_end)
    .filter(Boolean)
    .sort()
    .reverse()

  return {
    total_cash_advance_outstanding: outstanding,
    payroll_run_count: paidLines.length,
    total_gross_paid: totalGross,
    total_net_paid: totalNet,
    last_payroll_date: sortedDates[0] ?? null,
  }
}

export async function generateEmployeeNumber(): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employees')
    .select('employee_number')
    .order('employee_number', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return 'EMP-0001'

  const match = data[0].employee_number.match(/EMP-(\d+)/)
  if (match) {
    return `EMP-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`
  }
  return 'EMP-0001'
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employees')
    .insert(input)
    .select()
    .single()
  if (error) throw new Error(`Failed to create employee: ${error.message}`)
  return data as Employee
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employees')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`Failed to update employee: ${error.message}`)
  return data as Employee
}

export async function deleteEmployee(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('employees')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Failed to deactivate employee: ${error.message}`)
}

// ── Attendance ─────────────────────────────────────────────────────────────────

export async function getAttendance(
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<AttendanceRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employee_attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('attendance_date', startDate)
    .lte('attendance_date', endDate)
    .order('attendance_date')
  if (error) throw new Error(`Failed to fetch attendance: ${error.message}`)
  return (data || []) as AttendanceRow[]
}

export async function bulkUpsertAttendance(
  rows: {
    employee_id: string
    attendance_date: string
    status: AttendanceRow['status']
    time_in?: string | null
    time_out?: string | null
    regular_hours: number
    overtime_hours: number
    notes?: string | null
    created_by?: string | null
  }[]
): Promise<void> {
  if (rows.length === 0) return
  const supabase = createClient()
  const { error } = await supabase
    .from('employee_attendance')
    .upsert(
      rows.map(r => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: 'employee_id,attendance_date' }
    )
  if (error) throw new Error(`Failed to save attendance: ${error.message}`)
}

// ── Payroll Runs ───────────────────────────────────────────────────────────────

export async function getPayrollRuns(params?: {
  page?: number
  limit?: number
}): Promise<{ data: PayrollRun[]; total: number }> {
  const supabase = createClient()
  const { page = 1, limit = 20 } = params || {}
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('employee_payroll_runs')
    .select('*', { count: 'exact' })
    .order('period_start', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`Failed to fetch payroll runs: ${error.message}`)
  return { data: (data || []) as PayrollRun[], total: count || 0 }
}

export async function getPayrollRun(id: string): Promise<PayrollRun> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employee_payroll_runs')
    .select(`
      *,
      lines:employee_payroll_lines(
        *,
        employee:employees(id, employee_number, first_name, last_name, position, salary_type, base_rate, overtime_rate)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw new Error(`Failed to fetch payroll run: ${error.message}`)
  return data as PayrollRun
}

export async function getEmployeePayrollLines(employeeId: string): Promise<(PayrollLine & { run: PayrollRun })[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employee_payroll_lines')
    .select(`
      *,
      run:employee_payroll_runs(id, period_start, period_end, label, status, paid_at)
    `)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to fetch payroll lines: ${error.message}`)
  return (data || []) as any[]
}

export async function createPayrollRun(
  periodStart: string,
  periodEnd: string,
  userId: string
): Promise<PayrollRun> {
  const supabase = createClient()

  // Build label
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const label = `${fmt(periodStart)} – ${fmt(periodEnd)}`

  // Create the run
  const { data: run, error: runErr } = await supabase
    .from('employee_payroll_runs')
    .insert({ period_start: periodStart, period_end: periodEnd, label, created_by: userId })
    .select()
    .single()
  if (runErr) throw new Error(`Failed to create payroll run: ${runErr.message}`)

  // Fetch all active employees
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, salary_type, base_rate, overtime_rate')
    .eq('status', 'active')
  if (empErr) throw new Error(empErr.message)

  const allEmployees = (employees || []) as Pick<Employee, 'id' | 'salary_type' | 'base_rate' | 'overtime_rate'>[]
  if (allEmployees.length === 0) return run as PayrollRun

  // Fetch attendance for period
  const { data: attendance, error: attErr } = await supabase
    .from('employee_attendance')
    .select('employee_id, status, regular_hours, overtime_hours')
    .in('employee_id', allEmployees.map(e => e.id))
    .gte('attendance_date', periodStart)
    .lte('attendance_date', periodEnd)
  if (attErr) throw new Error(attErr.message)

  // Fetch outstanding cash advances per employee
  const { data: advances, error: advErr } = await supabase
    .from('employee_cash_advances')
    .select('employee_id, amount_remaining')
    .in('employee_id', allEmployees.map(e => e.id))
    .neq('status', 'fully_paid')
  if (advErr) throw new Error(advErr.message)

  // Build advance totals per employee
  const advanceMap = new Map<string, number>()
  for (const adv of (advances as any[]) || []) {
    advanceMap.set(adv.employee_id, (advanceMap.get(adv.employee_id) || 0) + Number(adv.amount_remaining))
  }

  // Build attendance summary per employee
  // days_worked counts full days (present/holiday = 1, half_day = 0.5)
  // regular_hours is the actual hours entered (used for OT calc; basic_pay uses days_worked)
  const attMap = new Map<string, { days: number; reg_hours: number; ot_hours: number }>()
  for (const row of (attendance as any[]) || []) {
    const cur = attMap.get(row.employee_id) || { days: 0, reg_hours: 0, ot_hours: 0 }
    if (['present', 'holiday'].includes(row.status)) cur.days += 1
    else if (row.status === 'half_day') cur.days += 0.5
    cur.reg_hours += Number(row.regular_hours || 0)
    cur.ot_hours += Number(row.overtime_hours || 0)
    attMap.set(row.employee_id, cur)
  }

  // Compute payroll lines
  const lines = allEmployees.map(emp => {
    const att = attMap.get(emp.id) || { days: 0, reg_hours: 0, ot_hours: 0 }
    const basic_pay = computeBasicPay(emp as any, att.days)
    const hourly_rate = emp.base_rate / 8
    const overtime_pay = parseFloat((hourly_rate * (emp.overtime_rate / 100) * att.ot_hours).toFixed(4))
    const gross_pay = parseFloat((basic_pay + overtime_pay).toFixed(4))
    const outstanding = advanceMap.get(emp.id) || 0
    // Cap deduction at 50% of gross
    const cash_advance_deduction = parseFloat(Math.min(outstanding, gross_pay * 0.5).toFixed(4))
    const total_deductions = cash_advance_deduction
    const net_pay = parseFloat(Math.max(0, gross_pay - total_deductions).toFixed(4))

    return {
      payroll_run_id: (run as any).id,
      employee_id: emp.id,
      days_worked: att.days,
      regular_hours: att.reg_hours,
      overtime_hours: att.ot_hours,
      basic_pay: parseFloat(basic_pay.toFixed(4)),
      overtime_pay,
      bonuses: 0,
      adjustments: 0,
      gross_pay,
      cash_advance_deduction,
      sss_deduction: 0,
      philhealth_deduction: 0,
      pagibig_deduction: 0,
      other_deductions: 0,
      total_deductions,
      net_pay,
    }
  })

  const { error: linesErr } = await supabase.from('employee_payroll_lines').insert(lines)
  if (linesErr) throw new Error(`Failed to create payroll lines: ${linesErr.message}`)

  // Update run totals
  const totalGross = lines.reduce((s, l) => s + l.gross_pay, 0)
  const totalDeductions = lines.reduce((s, l) => s + l.total_deductions, 0)
  const totalNet = lines.reduce((s, l) => s + l.net_pay, 0)

  const { error: updateErr } = await supabase
    .from('employee_payroll_runs')
    .update({
      total_gross: parseFloat(totalGross.toFixed(4)),
      total_deductions: parseFloat(totalDeductions.toFixed(4)),
      total_net: parseFloat(totalNet.toFixed(4)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', (run as any).id)
  if (updateErr) throw new Error(updateErr.message)

  return { ...(run as any), total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet }
}

export async function updatePayrollLine(
  lineId: string,
  updates: {
    bonuses?: number
    adjustments?: number
    sss_deduction?: number
    philhealth_deduction?: number
    pagibig_deduction?: number
    other_deductions?: number
    cash_advance_deduction?: number
    bonus_notes?: string | null
    adjustment_notes?: string | null
  }
): Promise<PayrollLine> {
  const supabase = createClient()

  // Fetch current line first to recompute totals
  const { data: current, error: fetchErr } = await supabase
    .from('employee_payroll_lines')
    .select('*')
    .eq('id', lineId)
    .single()
  if (fetchErr) throw new Error(fetchErr.message)

  const line = { ...(current as any), ...updates }
  const gross_pay = parseFloat(
    (Number(line.basic_pay) + Number(line.overtime_pay) + Number(line.bonuses) + Number(line.adjustments)).toFixed(4)
  )
  const total_deductions = parseFloat(
    (
      Number(line.cash_advance_deduction) +
      Number(line.sss_deduction) +
      Number(line.philhealth_deduction) +
      Number(line.pagibig_deduction) +
      Number(line.other_deductions)
    ).toFixed(4)
  )
  const net_pay = parseFloat(Math.max(0, gross_pay - total_deductions).toFixed(4))

  const { data, error } = await supabase
    .from('employee_payroll_lines')
    .update({ ...updates, gross_pay, total_deductions, net_pay })
    .eq('id', lineId)
    .select()
    .single()
  if (error) throw new Error(`Failed to update payroll line: ${error.message}`)

  // Recompute run totals
  await recomputeRunTotals((current as any).payroll_run_id)

  return data as PayrollLine
}

async function recomputeRunTotals(runId: string) {
  const supabase = createClient()
  const { data: lines, error } = await supabase
    .from('employee_payroll_lines')
    .select('gross_pay, total_deductions, net_pay')
    .eq('payroll_run_id', runId)
  if (error) return

  const totalGross = ((lines as any[]) || []).reduce((s, l) => s + Number(l.gross_pay), 0)
  const totalDeductions = ((lines as any[]) || []).reduce((s, l) => s + Number(l.total_deductions), 0)
  const totalNet = ((lines as any[]) || []).reduce((s, l) => s + Number(l.net_pay), 0)

  await supabase
    .from('employee_payroll_runs')
    .update({
      total_gross: parseFloat(totalGross.toFixed(4)),
      total_deductions: parseFloat(totalDeductions.toFixed(4)),
      total_net: parseFloat(totalNet.toFixed(4)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
}

export async function deletePayrollRun(runId: string): Promise<void> {
  const supabase = createClient()
  // Delete lines first (cascade should handle it, but be explicit)
  const { error: linesErr } = await supabase
    .from('employee_payroll_lines')
    .delete()
    .eq('payroll_run_id', runId)
  if (linesErr) throw new Error(`Failed to delete payroll lines: ${linesErr.message}`)

  const { error } = await supabase
    .from('employee_payroll_runs')
    .delete()
    .eq('id', runId)
    .neq('status', 'paid') // never delete paid runs
  if (error) throw new Error(`Failed to delete payroll run: ${error.message}`)
}

export async function finalizePayrollRun(runId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('employee_payroll_runs')
    .update({ status: 'finalized', updated_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) throw new Error(`Failed to finalize payroll run: ${error.message}`)
}

export async function payPayrollRun(
  runId: string,
  userId: string,
  branchId: string
): Promise<void> {
  const supabase = createClient()

  // Get run + lines
  const { data: run, error: runErr } = await supabase
    .from('employee_payroll_runs')
    .select(`*, lines:employee_payroll_lines(id, employee_id, cash_advance_deduction, net_pay)`)
    .eq('id', runId)
    .single()
  if (runErr) throw new Error(runErr.message)

  const runData = run as any

  // Deduct cash advances for each line
  for (const line of (runData.lines || []) as any[]) {
    if (Number(line.cash_advance_deduction) > 0) {
      // Fetch outstanding advances for employee (oldest first)
      const { data: advances } = await supabase
        .from('employee_cash_advances')
        .select('id, amount_remaining')
        .eq('employee_id', line.employee_id)
        .neq('status', 'fully_paid')
        .order('advance_date')

      let remaining = Number(line.cash_advance_deduction)
      for (const adv of (advances || []) as any[]) {
        if (remaining <= 0) break
        const deduct = Math.min(remaining, Number(adv.amount_remaining))
        const newRemaining = parseFloat((Number(adv.amount_remaining) - deduct).toFixed(4))
        const newStatus = newRemaining <= 0 ? 'fully_paid' : (deduct < Number(adv.amount_remaining) ? 'partially_paid' : 'outstanding')
        await supabase
          .from('employee_cash_advances')
          .update({ amount_remaining: newRemaining, status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', adv.id)
        remaining -= deduct
      }
    }
  }

  // Get or create "Salaries & Wages" expense category
  const categoryId = await createOrGetSalaryCategory()

  // Generate expense number
  const { data: expenseNumber } = await supabase.rpc('generate_expense_number')

  const lineCount = (runData.lines || []).length
  const { data: expense, error: expErr } = await supabase
    .from('expenses')
    .insert({
      expense_number: expenseNumber,
      branch_id: branchId,
      category_id: categoryId,
      amount: Number(runData.total_net),
      expense_date: runData.period_end,
      description: `Payroll: ${runData.label} (${lineCount} employee${lineCount !== 1 ? 's' : ''})`,
      paid_to: 'Employees',
      notes: `Payroll Run ID: ${runId}`,
      created_by: userId,
    })
    .select('id')
    .single()
  if (expErr) throw new Error(`Failed to create salary expense: ${expErr.message}`)

  // Mark run as paid
  const { error: updateErr } = await supabase
    .from('employee_payroll_runs')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      expense_id: (expense as any).id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
  if (updateErr) throw new Error(updateErr.message)
}

export async function createOrGetSalaryCategory(): Promise<string> {
  const supabase = createClient()

  // Try to find existing
  const { data: existing } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('name', 'Salaries & Wages')
    .single()

  if (existing) return (existing as any).id

  // Create it
  const { data: created, error } = await supabase
    .from('expense_categories')
    .insert({ name: 'Salaries & Wages', is_system: true, color: '#6366f1' })
    .select('id')
    .single()
  if (error) throw new Error(`Failed to create salary category: ${error.message}`)
  return (created as any).id
}

// ── Cash Advances ──────────────────────────────────────────────────────────────

export async function getCashAdvances(employeeId: string): Promise<CashAdvance[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employee_cash_advances')
    .select('*')
    .eq('employee_id', employeeId)
    .order('advance_date', { ascending: false })
  if (error) throw new Error(`Failed to fetch cash advances: ${error.message}`)
  return (data || []) as CashAdvance[]
}

export async function createCashAdvance(
  employeeId: string,
  amount: number,
  reason: string | null,
  advanceDate: string,
  userId: string
): Promise<CashAdvance> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employee_cash_advances')
    .insert({
      employee_id: employeeId,
      amount,
      amount_remaining: amount,
      reason,
      advance_date: advanceDate,
      status: 'outstanding',
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw new Error(`Failed to create cash advance: ${error.message}`)
  return data as CashAdvance
}

// ── All-employee stats for list page ──────────────────────────────────────────

export interface EmployeeListStat {
  employee_id: string
  outstanding_advances: number
}

export async function getAllEmployeeStats(): Promise<Map<string, EmployeeListStat>> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employee_cash_advances')
    .select('employee_id, amount_remaining')
    .neq('status', 'fully_paid')
  if (error) throw new Error(error.message)

  const map = new Map<string, EmployeeListStat>()
  for (const row of (data as any[]) || []) {
    const cur = map.get(row.employee_id) || { employee_id: row.employee_id, outstanding_advances: 0 }
    cur.outstanding_advances += Number(row.amount_remaining || 0)
    map.set(row.employee_id, cur)
  }
  return map
}
