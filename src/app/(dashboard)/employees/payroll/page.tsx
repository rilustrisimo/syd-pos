'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  usePayrollRuns,
  usePayrollRun,
  useCreatePayrollRun,
  useUpdatePayrollLine,
  useDeletePayrollRun,
  useFinalizePayrollRun,
  usePayPayrollRun,
} from '@/hooks/useEmployees'
import { useAuthStore } from '@/lib/stores/auth'
import { useBranches } from '@/hooks/useInventory'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Check,
  Banknote,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PayrollLine } from '@/lib/supabase/queries/employees'

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
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Default to previous complete Sun–Sat week (work week is Sun–Sat, payday Saturday)
function getLastWeekDates() {
  const today = new Date()
  const dow = today.getDay() // 0=Sun
  // Find the most recent Sunday (start of last week)
  const thisSun = new Date(today)
  thisSun.setDate(today.getDate() - dow)
  const lastSun = new Date(thisSun)
  lastSun.setDate(thisSun.getDate() - 7)
  const lastSat = new Date(lastSun)
  lastSat.setDate(lastSun.getDate() + 6)
  const toISO = (d: Date) => d.toISOString().split('T')[0]
  return { start: toISO(lastSun), end: toISO(lastSat) }
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  finalized: { label: 'Finalized', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  paid:      { label: 'Paid',      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
}

// ── Payroll Run Detail ─────────────────────────────────────────────────────────

function PayrollRunDetail({ runId, branchId, userId, onDeleted }: {
  runId: string; branchId: string; userId: string; onDeleted: () => void
}) {
  const { data: run, isLoading } = usePayrollRun(runId)
  const updateLineMutation = useUpdatePayrollLine()
  const finalizeMutation = useFinalizePayrollRun()
  const payMutation = usePayPayrollRun()
  const deleteMutation = useDeletePayrollRun()

  const [editingLine, setEditingLine] = useState<string | null>(null)
  const [lineEdits, setLineEdits] = useState<Record<string, {
    bonuses: string; adjustments: string
    sss_deduction: string; philhealth_deduction: string; pagibig_deduction: string
    other_deductions: string; cash_advance_deduction: string
    bonus_notes: string; adjustment_notes: string
  }>>({})
  const [confirmPay, setConfirmPay] = useState(false)
  const [confirmDelete1, setConfirmDelete1] = useState(false)
  const [confirmDelete2, setConfirmDelete2] = useState(false)

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" /></div>
  if (!run) return <div className="text-center py-8 text-muted-foreground">Run not found</div>

  const lines = (run.lines || []) as (PayrollLine & { employee: any })[]
  const cfg = statusConfig[run.status] || statusConfig.draft
  const isDraft = run.status === 'draft'
  const isFinalized = run.status === 'finalized'

  function startEdit(line: PayrollLine) {
    setEditingLine(line.id)
    setLineEdits(prev => ({
      ...prev,
      [line.id]: {
        bonuses: String(line.bonuses || 0),
        adjustments: String(line.adjustments || 0),
        sss_deduction: String(line.sss_deduction || 0),
        philhealth_deduction: String(line.philhealth_deduction || 0),
        pagibig_deduction: String(line.pagibig_deduction || 0),
        other_deductions: String(line.other_deductions || 0),
        cash_advance_deduction: String(line.cash_advance_deduction || 0),
        bonus_notes: line.bonus_notes || '',
        adjustment_notes: line.adjustment_notes || '',
      },
    }))
  }

  async function saveEdit(lineId: string) {
    const edits = lineEdits[lineId]
    if (!edits) return
    try {
      await updateLineMutation.mutateAsync({
        lineId,
        updates: {
          bonuses: Number(edits.bonuses) || 0,
          adjustments: Number(edits.adjustments) || 0,
          sss_deduction: Number(edits.sss_deduction) || 0,
          philhealth_deduction: Number(edits.philhealth_deduction) || 0,
          pagibig_deduction: Number(edits.pagibig_deduction) || 0,
          other_deductions: Number(edits.other_deductions) || 0,
          cash_advance_deduction: Number(edits.cash_advance_deduction) || 0,
          bonus_notes: edits.bonus_notes || null,
          adjustment_notes: edits.adjustment_notes || null,
        },
      })
      setEditingLine(null)
      toast.success('Line updated')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleFinalize() {
    try {
      await finalizeMutation.mutateAsync(runId)
      toast.success('Payroll finalized')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handlePay() {
    try {
      await payMutation.mutateAsync({ runId, userId, branchId })
      toast.success('Payroll paid — expense recorded under Salaries & Wages')
      setConfirmPay(false)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(runId)
      toast.success('Payroll run deleted')
      setConfirmDelete2(false)
      onDeleted()
    } catch (err: any) {
      toast.error(err.message)
      setConfirmDelete2(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-lg">{run.label}</h3>
          <div className="flex gap-3 text-sm text-muted-foreground mt-0.5">
            <span>{formatDate(run.period_start)} – {formatDate(run.period_end)}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
              {cfg.label}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {!run.status || run.status !== 'paid' ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setConfirmDelete1(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          ) : null}
          {isDraft && (
            <Button variant="outline" onClick={handleFinalize} disabled={finalizeMutation.isPending}>
              {finalizeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Finalize
            </Button>
          )}
          {isFinalized && (
            <Button onClick={() => setConfirmPay(true)} disabled={payMutation.isPending}>
              <Banknote className="h-4 w-4 mr-2" />
              Pay All
            </Button>
          )}
        </div>
      </div>

      {/* Summary totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Total Gross</div>
          <div className="font-bold">{formatCurrency(Number(run.total_gross))}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Total Deductions</div>
          <div className="font-bold text-red-600">{formatCurrency(Number(run.total_deductions))}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Total Net Pay</div>
          <div className="font-bold text-green-700">{formatCurrency(Number(run.total_net))}</div>
        </div>
      </div>

      {/* Lines table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>OT Hrs</TableHead>
              <TableHead>Basic Pay</TableHead>
              <TableHead>OT Pay</TableHead>
              <TableHead>Bonus</TableHead>
              <TableHead>Adj</TableHead>
              <TableHead>CA Deduct</TableHead>
              <TableHead>Net Pay</TableHead>
              {isDraft && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map(line => {
              const emp = (line as any).employee
              const isEditing = editingLine === line.id
              const edits = lineEdits[line.id]

              return (
                <TableRow key={line.id} className={isEditing ? 'bg-muted/20' : ''}>
                  <TableCell className="font-medium text-sm">
                    {emp ? `${emp.last_name}, ${emp.first_name}` : '—'}
                    <div className="text-xs text-muted-foreground">{emp?.position}</div>
                  </TableCell>
                  <TableCell>{Number(line.days_worked)}</TableCell>
                  <TableCell>{Number(line.overtime_hours)}</TableCell>
                  <TableCell>{formatCurrency(Number(line.basic_pay))}</TableCell>
                  <TableCell>{formatCurrency(Number(line.overtime_pay))}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="number"
                        className="h-7 text-xs w-[90px]"
                        value={edits?.bonuses || '0'}
                        onChange={e => setLineEdits(p => ({ ...p, [line.id]: { ...p[line.id], bonuses: e.target.value } }))}
                      />
                    ) : formatCurrency(Number(line.bonuses))}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="number"
                        className="h-7 text-xs w-[90px]"
                        value={edits?.adjustments || '0'}
                        onChange={e => setLineEdits(p => ({ ...p, [line.id]: { ...p[line.id], adjustments: e.target.value } }))}
                      />
                    ) : (
                      <span className={Number(line.adjustments) < 0 ? 'text-red-600' : ''}>
                        {formatCurrency(Number(line.adjustments))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="number"
                        className="h-7 text-xs w-[90px]"
                        value={edits?.cash_advance_deduction || '0'}
                        onChange={e => setLineEdits(p => ({ ...p, [line.id]: { ...p[line.id], cash_advance_deduction: e.target.value } }))}
                      />
                    ) : (
                      Number(line.cash_advance_deduction) > 0
                        ? <span className="text-orange-600">{formatCurrency(Number(line.cash_advance_deduction))}</span>
                        : '—'
                    )}
                  </TableCell>
                  <TableCell className="font-bold text-green-700">
                    {formatCurrency(Number(line.net_pay))}
                  </TableCell>
                  {isDraft && (
                    <TableCell>
                      {isEditing ? (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEdit(line.id)}>
                          {updateLineMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => startEdit(line)}>
                          Edit
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pay confirmation */}
      <AlertDialog open={confirmPay} onOpenChange={setConfirmPay}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Payroll as Paid?</AlertDialogTitle>
            <AlertDialogDescription>
              This will pay out <strong>{formatCurrency(Number(run.total_net))}</strong> to {lines.length} employee{lines.length !== 1 ? 's' : ''},
              deduct outstanding cash advances, and create a <strong>Salaries & Wages</strong> expense entry.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePay} disabled={payMutation.isPending}>
              {payMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Pay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete — first confirmation */}
      <AlertDialog open={confirmDelete1} onOpenChange={setConfirmDelete1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payroll Run?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete <strong>{run.label}</strong>. All payroll lines will be removed.
              This cannot be undone. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { setConfirmDelete1(false); setConfirmDelete2(true) }}
            >
              Yes, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete — second confirmation */}
      <AlertDialog open={confirmDelete2} onOpenChange={setConfirmDelete2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This is your final confirmation. Deleting <strong>{run.label}</strong> is permanent and
              cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const { user } = useAuthStore()
  const { data: branches = [] } = useBranches()
  const branchId = user?.branchId ?? branches[0]?.id ?? ''

  const { data: runsData, isLoading: runsLoading } = usePayrollRuns({ limit: 30 })
  const createMutation = useCreatePayrollRun()

  const lastWeek = useMemo(() => getLastWeekDates(), [])
  const [periodStart, setPeriodStart] = useState(lastWeek.start)
  const [periodEnd, setPeriodEnd] = useState(lastWeek.end)
  const [newRunOpen, setNewRunOpen] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const runs = runsData?.data || []

  async function handleCreate() {
    try {
      const run = await createMutation.mutateAsync({
        periodStart,
        periodEnd,
        userId: user?.id ?? '',
      })
      toast.success(`Payroll run created for ${run.label}`)
      setNewRunOpen(false)
      setSelectedRunId(run.id)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create payroll run')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/employees"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Payroll Runs</h1>
            <p className="text-sm text-muted-foreground">Generate and manage weekly payroll</p>
          </div>
        </div>
        <Button onClick={() => setNewRunOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Generate Payroll
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run list */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
            <CardDescription>All payroll runs</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {runsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : runs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground px-4">
                No payroll runs yet. Generate one to get started.
              </div>
            ) : (
              <div className="divide-y">
                {runs.map(run => {
                  const cfg = statusConfig[run.status] || statusConfig.draft
                  const isSelected = selectedRunId === run.id
                  return (
                    <button
                      key={run.id}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${isSelected ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{run.label || `${run.period_start} – ${run.period_end}`}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cfg.className}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Net: {formatCurrency(Number(run.total_net))}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Run detail */}
        <div className="lg:col-span-2">
          {selectedRunId ? (
            <Card>
              <CardContent className="pt-6">
                <PayrollRunDetail
                  runId={selectedRunId}
                  branchId={branchId}
                  userId={user?.id ?? ''}
                  onDeleted={() => setSelectedRunId(null)}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm">
              Select a payroll run to view details
            </div>
          )}
        </div>
      </div>

      {/* New run dialog */}
      <Dialog open={newRunOpen} onOpenChange={setNewRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Payroll Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Attendance data for all active employees in the selected period will be pulled automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period Start</Label>
                <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Period End</Label>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRunOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !periodStart || !periodEnd}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
