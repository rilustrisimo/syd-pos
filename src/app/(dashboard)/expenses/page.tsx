'use client'

import { useState } from 'react'
import {
  useExpenses,
  useExpenseCategories,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  getAllExpenses,
} from '@/hooks/useExpenses'
import type { Expense, ExpenseFilters } from '@/hooks/useExpenses'
import { downloadCSV } from '@/lib/utils/export'
import { useAuthStore } from '@/lib/stores/auth'
import { useBranches } from '@/hooks/useInventory'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { getTodayPH } from '@/lib/utils/datetime'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Receipt,
  Loader2,
  CalendarDays,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  DialogDescription,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ExpenseFormData {
  category_id: string
  amount: string
  expense_date: string
  description: string
  paid_to: string
  reference_number: string
  notes: string
}

function getInitialFormData(): ExpenseFormData {
  return {
    category_id: '',
    amount: '',
    expense_date: getTodayPH(),
    description: '',
    paid_to: '',
    reference_number: '',
    notes: '',
  }
}

export default function ExpensesPage() {
  const { user } = useAuthStore()

  // Filters state
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null)
  const [formData, setFormData] = useState<ExpenseFormData>(getInitialFormData())

  // Queries
  const { data: categoriesData } = useExpenseCategories()
  const { data: branchesData } = useBranches()
  const categories = categoriesData || []
  const branches = branchesData || []

  const filters: ExpenseFilters = {
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    category_id: categoryFilter !== 'all' ? categoryFilter : undefined,
    search: searchQuery || undefined,
    page: currentPage,
    limit: 20,
  }
  const { data: expensesData, isLoading } = useExpenses(filters)
  const expenses = expensesData?.data || []
  const totalCount = expensesData?.total || 0
  const totalPages = Math.ceil(totalCount / 20) || 1

  const createMutation = useCreateExpense()
  const updateMutation = useUpdateExpense()
  const deleteMutation = useDeleteExpense()

  // Derive the branch_id: use user's branch or fallback to first branch
  const branchId = user?.branchId ?? branches[0]?.id ?? ''

  const [isExporting, setIsExporting] = useState(false)

  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      const rows = await getAllExpenses({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        category_id: categoryFilter !== 'all' ? categoryFilter : undefined,
      })
      if (rows.length === 0) { toast.info('No expenses to export for the selected filters'); return }
      const from = dateFrom || 'all'
      const to = dateTo || 'all'
      downloadCSV(rows as any[], `expenses_${from}_${to}.csv`)
      toast.success(`Exported ${rows.length} expense${rows.length !== 1 ? 's' : ''}`)
    } catch (err: any) {
      toast.error(err.message || 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingExpense(null)
    setFormData(getInitialFormData())
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (expense: Expense) => {
    setEditingExpense(expense)
    setFormData({
      category_id: expense.category_id ?? '',
      amount: expense.amount.toString(),
      expense_date: expense.expense_date.slice(0, 10),
      description: expense.description ?? '',
      paid_to: expense.paid_to ?? '',
      reference_number: expense.reference_number ?? '',
      notes: expense.notes ?? '',
    })
    setIsDialogOpen(true)
  }

  const handleOpenDelete = (expense: Expense) => {
    setDeletingExpense(expense)
    setIsDeleteDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingExpense(null)
    setFormData(getInitialFormData())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Amount must be greater than zero')
      return
    }
    if (!formData.expense_date) {
      toast.error('Expense date is required')
      return
    }

    try {
      const input = {
        branch_id: branchId,
        category_id: formData.category_id || null,
        amount,
        expense_date: `${formData.expense_date}T12:00:00+08:00`,
        description: formData.description.trim() || null,
        paid_to: formData.paid_to.trim() || null,
        reference_number: formData.reference_number.trim() || null,
        notes: formData.notes.trim() || null,
      }

      if (editingExpense) {
        await updateMutation.mutateAsync({ id: editingExpense.id, input })
        toast.success('Expense updated successfully')
      } else {
        await createMutation.mutateAsync({ input, userId: user!.id })
        toast.success('Expense recorded successfully')
      }
      handleCloseDialog()
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    }
  }

  const handleDelete = async () => {
    if (!deletingExpense) return
    try {
      await deleteMutation.mutateAsync(deletingExpense.id)
      toast.success('Expense deleted')
      setIsDeleteDialogOpen(false)
      setDeletingExpense(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete expense')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">
            Track operational expenses for P&amp;L reporting
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Expenses List */}
      <Card>
        <CardHeader>
          <CardTitle>Expense Records</CardTitle>
          <CardDescription>{totalCount} total expense{totalCount !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-6 flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                className="w-[150px]"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
              />
              <span className="text-muted-foreground text-sm">to</span>
              <Input
                type="date"
                className="w-[150px]"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1) }}
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1) }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search description, payee, ref#..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No expenses found</h3>
              <p className="text-muted-foreground mb-4">
                {dateFrom || dateTo || categoryFilter !== 'all' || searchQuery
                  ? 'Try adjusting your filters'
                  : 'Record your first expense to get started'}
              </p>
              {!dateFrom && !dateTo && categoryFilter === 'all' && !searchQuery && (
                <Button onClick={handleOpenCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expense #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Paid To</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {expense.expense_number}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(expense.expense_date)}
                        </TableCell>
                        <TableCell>
                          {expense.category ? (
                            <Badge
                              style={{
                                backgroundColor: expense.category.color + '20',
                                color: expense.category.color,
                                borderColor: expense.category.color + '40',
                              }}
                              className="border font-medium"
                            >
                              {expense.category.name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {expense.description || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {expense.paid_to || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(expense.amount)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleOpenEdit(expense)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleOpenDelete(expense)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages} ({totalCount} total)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
            <DialogDescription>
              {editingExpense ? 'Update the expense details' : 'Record a new operational expense'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₱) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense_date">Date *</Label>
                  <Input
                    id="expense_date"
                    type="date"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category_id">Category</Label>
                <Select
                  value={formData.category_id || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, category_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No category —</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the expense"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paid_to">Paid To (Payee)</Label>
                  <Input
                    id="paid_to"
                    value={formData.paid_to}
                    onChange={(e) => setFormData({ ...formData, paid_to: e.target.value })}
                    placeholder="Vendor or payee name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference_number">Reference # (Receipt/Invoice)</Label>
                  <Input
                    id="reference_number"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="Receipt or invoice number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingExpense ? 'Update' : 'Record Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete expense{' '}
              <strong>{deletingExpense?.expense_number}</strong>
              {deletingExpense?.description ? ` — "${deletingExpense.description}"` : ''}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingExpense(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
