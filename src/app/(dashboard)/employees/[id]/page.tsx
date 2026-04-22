'use client'

import { use, useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useEmployee,
  useEmployeeStats,
  useUpdateEmployee,
  useAttendance,
  useBulkUpsertAttendance,
  useEmployeePayrollLines,
  useCashAdvances,
  useCreateCashAdvance,
} from '@/hooks/useEmployees'
import { useAuthStore } from '@/lib/stores/auth'
import type { AttendanceRow } from '@/lib/supabase/queries/employees'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Loader2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Plus,
  Phone,
  MapPin,
  Calendar,
  Banknote,
  CreditCard,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// Get ISO week dates (Sun–Sat) from a reference date — work week is Sun-Sat, payday Saturday
function getWeekDates(refDate: Date): Date[] {
  const day = refDate.getDay() // 0=Sun
  const sunday = new Date(refDate)
  sunday.setDate(refDate.getDate() - day)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d
  })
}

function toISODate(d: Date) {
  return d.toISOString().split('T')[0]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const ATTENDANCE_STATUSES: AttendanceRow['status'][] = [
  'present', 'absent', 'half_day', 'rest_day', 'holiday',
]

const attendanceStatusLabel: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half Day',
  rest_day: 'Rest Day',
  holiday: 'Holiday',
}

const payrollStatusConfig: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  finalized: { label: 'Finalized', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  paid:      { label: 'Paid',      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
}

const caStatusConfig: Record<string, { label: string; className: string }> = {
  outstanding:    { label: 'Outstanding',   className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  partially_paid: { label: 'Partial',       className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  fully_paid:     { label: 'Fully Paid',    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
}

function StatCard({ title, value, sub, color }: {
  title: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground font-medium">{title}</div>
        <div className={`text-2xl font-bold mt-1 ${color ?? ''}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

// ── Attendance Tab ─────────────────────────────────────────────────────────────

function AttendanceTab({ employeeId, userId }: { employeeId: string; userId: string }) {
  const [weekRef, setWeekRef] = useState(() => new Date())
  const weekDates = useMemo(() => getWeekDates(weekRef), [weekRef])
  const startDate = toISODate(weekDates[0])
  const endDate   = toISODate(weekDates[6])

  const { data: rows = [], isLoading } = useAttendance(employeeId, startDate, endDate)
  const saveMutation = useBulkUpsertAttendance()

  // Local editable state keyed by date string
  type RowState = {
    status: AttendanceRow['status']
    time_in: string
    time_out: string
    regular_hours: string
    overtime_hours: string
    notes: string
  }

  const [editRows, setEditRows] = useState<Record<string, RowState>>({})

  useEffect(() => {
    const map: Record<string, RowState> = {}
    for (const d of weekDates) {
      const dateStr = toISODate(d)
      const existing = rows.find(r => r.attendance_date === dateStr)
      map[dateStr] = existing
        ? {
            status: existing.status,
            time_in: existing.time_in || '',
            time_out: existing.time_out || '',
            regular_hours: String(existing.regular_hours),
            overtime_hours: String(existing.overtime_hours),
            notes: existing.notes || '',
          }
        : {
            // Sunday = half day (4 hrs); Mon–Sat = present (8 hrs)
            status: d.getDay() === 0 ? 'half_day' : 'present',
            time_in: '',
            time_out: '',
            regular_hours: d.getDay() === 0 ? '4' : '8',
            overtime_hours: '0',
            notes: '',
          }
    }
    setEditRows(map)
  }, [rows, startDate]) // eslint-disable-line react-hooks/exhaustive-deps

  function setRow(date: string, key: keyof RowState, value: string) {
    setEditRows(prev => ({
      ...prev,
      [date]: { ...prev[date], [key]: value },
    }))
  }

  async function handleSave() {
    const payload = weekDates.map(d => {
      const date = toISODate(d)
      const r = editRows[date]
      return {
        employee_id: employeeId,
        attendance_date: date,
        status: r.status,
        time_in: r.time_in || null,
        time_out: r.time_out || null,
        regular_hours: Number(r.regular_hours) || 0,
        overtime_hours: Number(r.overtime_hours) || 0,
        notes: r.notes || null,
        created_by: userId,
      }
    })
    try {
      await saveMutation.mutateAsync(payload)
      toast.success('Attendance saved')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save attendance')
    }
  }

  const weekLabel = `${weekDates[0].toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // Monthly summary from loaded rows
  const totalDays = rows.filter(r => ['present', 'holiday'].includes(r.status)).length
    + rows.filter(r => r.status === 'half_day').length * 0.5
  const totalOT = rows.reduce((s, r) => s + Number(r.overtime_hours || 0), 0)

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between">
        <span className="font-medium">{weekLabel}</span>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => setWeekRef(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekRef(new Date())}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => setWeekRef(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time In</TableHead>
                <TableHead>Time Out</TableHead>
                <TableHead>Reg Hrs</TableHead>
                <TableHead>OT Hrs</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weekDates.map((d, i) => {
                const dateStr = toISODate(d)
                const row = editRows[dateStr] || { status: 'present', time_in: '', time_out: '', regular_hours: '8', overtime_hours: '0', notes: '' }
                const isSunday = d.getDay() === 0
                return (
                  <TableRow key={dateStr} className={isSunday ? 'bg-muted/30' : ''}>
                    <TableCell className="font-medium text-sm">{DAY_NAMES[i]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.status}
                        onValueChange={v => {
                          const s = v as AttendanceRow['status']
                          setEditRows(prev => ({
                            ...prev,
                            [dateStr]: {
                              ...prev[dateStr],
                              status: s,
                              regular_hours: s === 'absent' || s === 'rest_day' ? '0'
                                : s === 'half_day' ? '4'
                                : '8',
                              overtime_hours: s === 'absent' || s === 'rest_day' ? '0' : prev[dateStr]?.overtime_hours || '0',
                            },
                          }))
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ATTENDANCE_STATUSES.map(s => (
                            <SelectItem key={s} value={s}>{attendanceStatusLabel[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        className="h-8 text-xs w-[100px]"
                        value={row.time_in}
                        onChange={e => setRow(dateStr, 'time_in', e.target.value)}
                        disabled={['absent', 'rest_day'].includes(row.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        className="h-8 text-xs w-[100px]"
                        value={row.time_out}
                        onChange={e => setRow(dateStr, 'time_out', e.target.value)}
                        disabled={['absent', 'rest_day'].includes(row.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        className="h-8 text-xs w-[70px]"
                        value={row.regular_hours}
                        onChange={e => setRow(dateStr, 'regular_hours', e.target.value)}
                        disabled={['absent', 'rest_day'].includes(row.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        className="h-8 text-xs w-[70px]"
                        value={row.overtime_hours}
                        onChange={e => setRow(dateStr, 'overtime_hours', e.target.value)}
                        disabled={['absent', 'rest_day'].includes(row.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-xs w-[140px]"
                        value={row.notes}
                        onChange={e => setRow(dateStr, 'notes', e.target.value)}
                        placeholder="optional"
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          This week: <span className="font-medium text-foreground">{totalDays} days</span> worked,{' '}
          <span className="font-medium text-foreground">{totalOT}h</span> OT
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Attendance
        </Button>
      </div>
    </div>
  )
}

// ── Payroll Tab ────────────────────────────────────────────────────────────────

function PayrollTab({ employeeId }: { employeeId: string }) {
  const { data: lines = [], isLoading } = useEmployeePayrollLines(employeeId)
  const [expandedLine, setExpandedLine] = useState<string | null>(null)

  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : lines.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No payroll records yet</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Gross Pay</TableHead>
              <TableHead>CA Deducted</TableHead>
              <TableHead>Total Deductions</TableHead>
              <TableHead>Net Pay</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line: any) => {
              const cfg = payrollStatusConfig[line.run?.status] || payrollStatusConfig.draft
              return (
                <>
                  <TableRow
                    key={line.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedLine(expandedLine === line.id ? null : line.id)}
                  >
                    <TableCell className="text-sm">
                      {line.run?.label || `${formatDate(line.run?.period_start)} – ${formatDate(line.run?.period_end)}`}
                    </TableCell>
                    <TableCell>{Number(line.days_worked)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(Number(line.gross_pay))}</TableCell>
                    <TableCell>
                      {Number(line.cash_advance_deduction) > 0
                        ? <span className="text-orange-600">{formatCurrency(Number(line.cash_advance_deduction))}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell>{formatCurrency(Number(line.total_deductions))}</TableCell>
                    <TableCell className="font-bold text-green-700">{formatCurrency(Number(line.net_pay))}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                        {cfg.label}
                      </span>
                    </TableCell>
                  </TableRow>
                  {expandedLine === line.id && (
                    <TableRow key={`${line.id}-detail`} className="bg-muted/20">
                      <TableCell colSpan={7} className="py-3 px-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Basic Pay</span>
                            <div className="font-medium">{formatCurrency(Number(line.basic_pay))}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">OT Pay ({Number(line.overtime_hours)}h)</span>
                            <div className="font-medium">{formatCurrency(Number(line.overtime_pay))}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Bonuses</span>
                            <div className="font-medium">{formatCurrency(Number(line.bonuses))}</div>
                            {line.bonus_notes && <div className="text-xs text-muted-foreground">{line.bonus_notes}</div>}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Adjustments</span>
                            <div className={`font-medium ${Number(line.adjustments) < 0 ? 'text-red-600' : ''}`}>
                              {formatCurrency(Number(line.adjustments))}
                            </div>
                            {line.adjustment_notes && <div className="text-xs text-muted-foreground">{line.adjustment_notes}</div>}
                          </div>
                          {(Number(line.sss_deduction) > 0 || Number(line.philhealth_deduction) > 0 || Number(line.pagibig_deduction) > 0) && (
                            <>
                              <div>
                                <span className="text-muted-foreground">SSS</span>
                                <div className="font-medium">{formatCurrency(Number(line.sss_deduction))}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">PhilHealth</span>
                                <div className="font-medium">{formatCurrency(Number(line.philhealth_deduction))}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Pag-IBIG</span>
                                <div className="font-medium">{formatCurrency(Number(line.pagibig_deduction))}</div>
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

// ── Cash Advances Tab ──────────────────────────────────────────────────────────

function CashAdvancesTab({ employeeId, userId }: { employeeId: string; userId: string }) {
  const { data: advances = [], isLoading } = useCashAdvances(employeeId)
  const createMutation = useCreateCashAdvance()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0] })

  const totalOutstanding = advances
    .filter(a => a.status !== 'fully_paid')
    .reduce((s, a) => s + Number(a.amount_remaining), 0)

  async function handleCreate() {
    try {
      await createMutation.mutateAsync({
        employeeId,
        amount: Number(form.amount),
        reason: form.reason.trim() || null,
        advanceDate: form.advance_date,
        userId,
      })
      toast.success('Cash advance recorded')
      setModalOpen(false)
      setForm({ amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0] })
    } catch (err: any) {
      toast.error(err.message || 'Failed to record cash advance')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          Total Outstanding:{' '}
          <span className={`font-bold ${totalOutstanding > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            {formatCurrency(totalOutstanding)}
          </span>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Advance
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : advances.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No cash advances recorded</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {advances.map(adv => {
              const cfg = caStatusConfig[adv.status] || caStatusConfig.outstanding
              return (
                <TableRow key={adv.id}>
                  <TableCell className="text-sm">{formatDate(adv.advance_date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{adv.reason || '—'}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(Number(adv.amount))}</TableCell>
                  <TableCell>
                    {Number(adv.amount_remaining) > 0
                      ? <span className="text-orange-600 font-medium">{formatCurrency(Number(adv.amount_remaining))}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Cash Advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Amount (₱) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.advance_date}
                onChange={e => setForm(f => ({ ...f, advance_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                placeholder="Optional reason..."
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !form.amount || Number(form.amount) <= 0}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuthStore()

  const { data: employee, isLoading } = useEmployee(id)
  const { data: stats } = useEmployeeStats(id)
  const updateMutation = useUpdateEmployee()

  const [editNotesOpen, setEditNotesOpen] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (employee) setNotes(employee.notes || '')
  }, [employee])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">Employee not found</p>
        <Button variant="outline" asChild>
          <Link href="/employees">Back to Employees</Link>
        </Button>
      </div>
    )
  }

  const statusConfig: Record<string, { label: string; className: string }> = {
    active:     { label: 'Active',     className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    inactive:   { label: 'Inactive',   className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    resigned:   { label: 'Resigned',   className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    terminated: { label: 'Terminated', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }
  const sCfg = statusConfig[employee.status] || statusConfig.inactive

  async function handleSaveNotes() {
    try {
      await updateMutation.mutateAsync({ id, input: { notes } })
      toast.success('Notes saved')
      setEditNotesOpen(false)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/employees')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">
                {employee.last_name}, {employee.first_name}
                {employee.nickname ? <span className="text-muted-foreground font-normal text-lg ml-2">"{employee.nickname}"</span> : null}
              </h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${sCfg.className}`}>
                {sCfg.label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
              <span className="font-mono">{employee.employee_number}</span>
              {employee.position && <span>{employee.position}</span>}
              {employee.department && <span>{employee.department}</span>}
              {employee.hire_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Hired {formatDate(employee.hire_date)}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/employees/payroll">
            <Banknote className="h-4 w-4 mr-2" />
            Run Payroll
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Outstanding Advances"
          value={stats ? formatCurrency(stats.total_cash_advance_outstanding) : '—'}
          color={stats && stats.total_cash_advance_outstanding > 0 ? 'text-orange-600' : undefined}
        />
        <StatCard
          title="Payroll Runs"
          value={stats?.payroll_run_count ?? '—'}
          sub="paid runs"
        />
        <StatCard
          title="Total Gross Paid"
          value={stats ? formatCurrency(stats.total_gross_paid) : '—'}
          sub="all time"
        />
        <StatCard
          title="Total Net Paid"
          value={stats ? formatCurrency(stats.total_net_paid) : '—'}
          sub={stats?.last_payroll_date ? `Last: ${formatDate(stats.last_payroll_date)}` : undefined}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="cash-advances">Cash Advances</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Salary info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Salary & Employment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employment Type</span>
                  <span className="font-medium capitalize">{employee.employment_type.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Salary Type</span>
                  <span className="font-medium capitalize">{employee.salary_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Rate</span>
                  <span className="font-bold">{formatCurrency(Number(employee.base_rate))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OT Rate</span>
                  <span className="font-medium">{employee.overtime_rate}% of hourly</span>
                </div>
                {employee.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium">{employee.phone}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payout info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Bank / Payout Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {employee.bank_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="font-medium">{employee.bank_name}</span>
                  </div>
                )}
                {employee.bank_account_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account #</span>
                    <span className="font-medium font-mono">{employee.bank_account_number}</span>
                  </div>
                )}
                {employee.gcash_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GCash</span>
                    <span className="font-medium">{employee.gcash_number}</span>
                  </div>
                )}
                {!employee.bank_name && !employee.bank_account_number && !employee.gcash_number && (
                  <p className="text-muted-foreground">No payout info set</p>
                )}
              </CardContent>
            </Card>

            {/* Government benefits */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Government Benefits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SSS #</span>
                  <span className="font-medium font-mono">{employee.sss_number || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PhilHealth #</span>
                  <span className="font-medium font-mono">{employee.philhealth_number || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pag-IBIG #</span>
                  <span className="font-medium font-mono">{employee.pagibig_number || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TIN #</span>
                  <span className="font-medium font-mono">{employee.tin_number || '—'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Notes</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setEditNotesOpen(true)}>
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {employee.notes || <span className="italic">No notes</span>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Attendance ── */}
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab employeeId={id} userId={user?.id ?? ''} />
        </TabsContent>

        {/* ── Payroll ── */}
        <TabsContent value="payroll" className="mt-4">
          <PayrollTab employeeId={id} />
        </TabsContent>

        {/* ── Cash Advances ── */}
        <TabsContent value="cash-advances" className="mt-4">
          <CashAdvancesTab employeeId={id} userId={user?.id ?? ''} />
        </TabsContent>
      </Tabs>

      {/* Edit notes dialog */}
      <Dialog open={editNotesOpen} onOpenChange={setEditNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Notes</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any notes about this employee..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNotesOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveNotes} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
