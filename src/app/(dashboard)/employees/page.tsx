'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useAllEmployeeStats,
  useGenerateEmployeeNumber,
  usePayrollRuns,
} from '@/hooks/useEmployees'
import { useAuthStore } from '@/lib/stores/auth'
import { useBranches } from '@/hooks/useInventory'
import type { Employee, CreateEmployeeInput } from '@/lib/supabase/queries/employees'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Users,
  Loader2,
  Eye,
  UserCheck,
  Banknote,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(n)
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active:      { label: 'Active',      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  inactive:    { label: 'Inactive',    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  resigned:    { label: 'Resigned',    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  terminated:  { label: 'Terminated',  className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
}

const employmentTypeLabel: Record<string, string> = {
  regular: 'Regular',
  part_time: 'Part-time',
  contractual: 'Contractual',
}

const salaryTypeLabel: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

// ── Employee Form ──────────────────────────────────────────────────────────────

interface EmployeeFormData {
  employee_number: string
  first_name: string
  last_name: string
  middle_name: string
  nickname: string
  phone: string
  position: string
  department: string
  employment_type: 'regular' | 'part_time' | 'contractual'
  salary_type: 'daily' | 'weekly' | 'monthly'
  base_rate: string
  overtime_rate: string
  status: 'active' | 'inactive' | 'resigned' | 'terminated'
  hire_date: string
}

const defaultForm: EmployeeFormData = {
  employee_number: '',
  first_name: '',
  last_name: '',
  middle_name: '',
  nickname: '',
  phone: '',
  position: '',
  department: '',
  employment_type: 'regular',
  salary_type: 'daily',
  base_rate: '',
  overtime_rate: '125',
  status: 'active',
  hire_date: '',
}

function EmployeeFormDialog({
  open,
  onOpenChange,
  initial,
  generatedNumber,
  onSave,
  isSaving,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: Partial<EmployeeFormData> | null
  generatedNumber?: string
  onSave: (data: EmployeeFormData) => void
  isSaving: boolean
}) {
  const [form, setForm] = useState<EmployeeFormData>(() => ({
    ...defaultForm,
    employee_number: generatedNumber || '',
    ...initial,
  }))

  // Sync generated number when dialog opens fresh
  const isNew = !initial

  function set(key: keyof EmployeeFormData, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleOpen(v: boolean) {
    if (v && isNew) {
      setForm({ ...defaultForm, employee_number: generatedNumber || '' })
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Employee' : 'Edit Employee'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Employee Number */}
          <div className="space-y-1.5">
            <Label>Employee #</Label>
            <Input value={form.employee_number} onChange={e => set('employee_number', e.target.value)} placeholder="EMP-0001" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set('status', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>First Name *</Label>
            <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Juan" />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name *</Label>
            <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Dela Cruz" />
          </div>
          <div className="space-y-1.5">
            <Label>Middle Name</Label>
            <Input value={form.middle_name} onChange={e => set('middle_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nickname</Label>
            <Input value={form.nickname} onChange={e => set('nickname', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="09xx xxx xxxx" />
          </div>
          <div className="space-y-1.5">
            <Label>Position</Label>
            <Input value={form.position} onChange={e => set('position', e.target.value)} placeholder="Cashier" />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Input value={form.department} onChange={e => set('department', e.target.value)} placeholder="Sales" />
          </div>
          <div className="space-y-1.5">
            <Label>Hire Date</Label>
            <Input type="date" value={form.hire_date} onChange={e => set('hire_date', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Employment Type</Label>
            <Select value={form.employment_type} onValueChange={v => set('employment_type', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="part_time">Part-time</SelectItem>
                <SelectItem value="contractual">Contractual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Salary Type</Label>
            <Select value={form.salary_type} onValueChange={v => set('salary_type', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Base Rate (₱)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.base_rate}
              onChange={e => set('base_rate', e.target.value)}
              placeholder="600.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>OT Rate (%)</Label>
            <Input
              type="number"
              min="100"
              step="1"
              value={form.overtime_rate}
              onChange={e => set('overtime_rate', e.target.value)}
              placeholder="125"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={isSaving || !form.first_name.trim() || !form.last_name.trim()}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isNew ? 'Add Employee' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const LIMIT = 20

export default function EmployeesPage() {
  const { user } = useAuthStore()
  const { data: branchesData } = useBranches()
  const branches = branchesData?.data || []
  const branchId = user?.branchId ?? branches[0]?.id ?? ''

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [page, setPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)

  const { data, isLoading } = useEmployees({ search, status: statusFilter, page, limit: LIMIT })
  const { data: allStatsMap } = useAllEmployeeStats()
  const { data: generatedNumber } = useGenerateEmployeeNumber()
  const { data: payrollRunsData } = usePayrollRuns({ limit: 1 })

  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee()

  const employees = data?.data || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / LIMIT)

  // Summary stats
  const totalActive = useMemo(() => employees.filter(e => e.status === 'active').length, [employees])
  const totalOutstanding = useMemo(() => {
    if (!allStatsMap) return 0
    let sum = 0
    allStatsMap.forEach(v => { sum += v.outstanding_advances })
    return sum
  }, [allStatsMap])

  const lastRun = payrollRunsData?.data?.[0]

  async function handleCreate(form: EmployeeFormData) {
    try {
      const input: CreateEmployeeInput = {
        employee_number: form.employee_number,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        middle_name: form.middle_name.trim() || null,
        nickname: form.nickname.trim() || null,
        phone: form.phone.trim() || null,
        address: null,
        position: form.position.trim() || null,
        department: form.department.trim() || null,
        employment_type: form.employment_type,
        salary_type: form.salary_type,
        base_rate: Number(form.base_rate) || 0,
        overtime_rate: Number(form.overtime_rate) || 125,
        status: form.status,
        hire_date: form.hire_date || null,
        end_date: null,
        sss_number: null,
        philhealth_number: null,
        pagibig_number: null,
        tin_number: null,
        bank_name: null,
        bank_account_number: null,
        gcash_number: null,
        notes: null,
      }
      await createMutation.mutateAsync(input)
      toast.success('Employee added')
      setAddOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to add employee')
    }
  }

  async function handleUpdate(form: EmployeeFormData) {
    if (!editEmployee) return
    try {
      await updateMutation.mutateAsync({
        id: editEmployee.id,
        input: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          middle_name: form.middle_name.trim() || null,
          nickname: form.nickname.trim() || null,
          phone: form.phone.trim() || null,
          position: form.position.trim() || null,
          department: form.department.trim() || null,
          employment_type: form.employment_type,
          salary_type: form.salary_type,
          base_rate: Number(form.base_rate) || 0,
          overtime_rate: Number(form.overtime_rate) || 125,
          status: form.status,
          hire_date: form.hire_date || null,
        },
      })
      toast.success('Employee updated')
      setEditEmployee(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update employee')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage employee profiles, attendance, and payroll</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/employees/payroll">
              <Banknote className="h-4 w-4 mr-2" />
              Run Payroll
            </Link>
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground font-medium">Total Employees</div>
            <div className="text-2xl font-bold mt-1">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground font-medium">Active</div>
            <div className="text-2xl font-bold mt-1 text-green-600">{totalActive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground font-medium">Outstanding Cash Advances</div>
            <div className="text-2xl font-bold mt-1 text-orange-600">{formatCurrency(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground font-medium">Last Payroll</div>
            <div className="text-2xl font-bold mt-1">
              {lastRun
                ? formatCurrency(Number(lastRun.total_net))
                : '—'}
            </div>
            {lastRun && (
              <div className="text-xs text-muted-foreground mt-0.5">{lastRun.label}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or employee #..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
              <Users className="h-10 w-10" />
              <p className="font-medium">No employees found</p>
              <p className="text-sm">Add your first employee to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Base Rate</TableHead>
                  <TableHead>Outstanding CA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(emp => {
                  const outstanding = allStatsMap?.get(emp.id)?.outstanding_advances ?? 0
                  const cfg = statusConfig[emp.status] || statusConfig.inactive
                  return (
                    <TableRow key={emp.id}>
                      <TableCell className="font-mono text-sm">{emp.employee_number}</TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {emp.last_name}, {emp.first_name}
                          {emp.nickname ? <span className="text-muted-foreground ml-1">"{emp.nickname}"</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{emp.position || '—'}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {employmentTypeLabel[emp.employment_type] || emp.employment_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {salaryTypeLabel[emp.salary_type]}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(Number(emp.base_rate))}</TableCell>
                      <TableCell>
                        {outstanding > 0 ? (
                          <span className="text-orange-600 font-medium">{formatCurrency(outstanding)}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/employees/${emp.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditEmployee(emp)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add dialog */}
      <EmployeeFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        generatedNumber={generatedNumber}
        onSave={handleCreate}
        isSaving={createMutation.isPending}
      />

      {/* Edit dialog */}
      {editEmployee && (
        <EmployeeFormDialog
          open={!!editEmployee}
          onOpenChange={v => { if (!v) setEditEmployee(null) }}
          initial={{
            employee_number: editEmployee.employee_number,
            first_name: editEmployee.first_name,
            last_name: editEmployee.last_name,
            middle_name: editEmployee.middle_name || '',
            nickname: editEmployee.nickname || '',
            phone: editEmployee.phone || '',
            position: editEmployee.position || '',
            department: editEmployee.department || '',
            employment_type: editEmployee.employment_type,
            salary_type: editEmployee.salary_type,
            base_rate: String(editEmployee.base_rate),
            overtime_rate: String(editEmployee.overtime_rate),
            status: editEmployee.status,
            hire_date: editEmployee.hire_date || '',
          }}
          onSave={handleUpdate}
          isSaving={updateMutation.isPending}
        />
      )}
    </div>
  )
}
