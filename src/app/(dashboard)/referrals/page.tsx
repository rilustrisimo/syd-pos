'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  useReferrers,
  useAllReferrerStats,
  useCreateReferrer,
  useUpdateReferrer,
  useDeleteReferrer,
} from '@/hooks/useReferrers'
import type { Referrer } from '@/lib/supabase/queries/referrers'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  Handshake,
  TrendingUp,
  Wallet,
  Users,
  PhilippinePeso,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'

interface ReferrerFormData {
  name: string
  phone: string
  profession: string
  address: string
  bank_details: string
  default_commission_rate: string
  is_active: boolean
}

const initialFormData: ReferrerFormData = {
  name: '',
  phone: '',
  profession: '',
  address: '',
  bank_details: '',
  default_commission_rate: '0',
  is_active: true,
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

export default function ReferralsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showInactive, setShowInactive] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingReferrer, setEditingReferrer] = useState<Referrer | null>(null)
  const [deletingReferrer, setDeletingReferrer] = useState<Referrer | null>(null)
  const [formData, setFormData] = useState<ReferrerFormData>(initialFormData)

  const { data: referrersData, isLoading } = useReferrers({
    search: searchQuery || undefined,
    is_active: showInactive ? undefined : true,
    page: currentPage,
    limit: 20,
  })
  const { data: globalStats } = useAllReferrerStats()

  const createMutation = useCreateReferrer()
  const updateMutation = useUpdateReferrer()
  const deleteMutation = useDeleteReferrer()

  const referrers = referrersData?.referrers || []
  const totalPages = referrersData?.totalPages || 1

  const handleOpenCreate = () => {
    setEditingReferrer(null)
    setFormData(initialFormData)
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (referrer: Referrer) => {
    setEditingReferrer(referrer)
    setFormData({
      name: referrer.name,
      phone: referrer.phone || '',
      profession: referrer.profession || '',
      address: referrer.address || '',
      bank_details: referrer.bank_details || '',
      default_commission_rate: referrer.default_commission_rate.toString(),
      is_active: referrer.is_active,
    })
    setIsDialogOpen(true)
  }

  const handleOpenDelete = (referrer: Referrer) => {
    setDeletingReferrer(referrer)
    setIsDeleteDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingReferrer(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Name is required')
      return
    }

    const rate = parseFloat(formData.default_commission_rate)
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast.error('Commission rate must be between 0 and 100')
      return
    }

    try {
      const input = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        profession: formData.profession.trim() || null,
        address: formData.address.trim() || null,
        bank_details: formData.bank_details.trim() || null,
        default_commission_rate: rate,
        is_active: formData.is_active,
      }

      if (editingReferrer) {
        await updateMutation.mutateAsync({ id: editingReferrer.id, input })
        toast.success('Referrer updated successfully')
      } else {
        await createMutation.mutateAsync(input)
        toast.success('Referrer created successfully')
      }
      handleCloseDialog()
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    }
  }

  const handleDelete = async () => {
    if (!deletingReferrer) return
    try {
      await deleteMutation.mutateAsync(deletingReferrer.id)
      toast.success('Referrer deactivated')
      setIsDeleteDialogOpen(false)
      setDeletingReferrer(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to deactivate referrer')
    }
  }

  // Per-referrer balance from global stats
  const getBalance = (referrerId: string): number => {
    if (!globalStats?.balanceMap) return 0
    const entry = globalStats.balanceMap.get(referrerId)
    if (!entry) return 0
    return entry.earned - entry.reversed - entry.paid_out
  }

  const getEarned = (referrerId: string): number => {
    if (!globalStats?.balanceMap) return 0
    return globalStats.balanceMap.get(referrerId)?.earned ?? 0
  }

  const getPaidOut = (referrerId: string): number => {
    if (!globalStats?.balanceMap) return 0
    return globalStats.balanceMap.get(referrerId)?.paid_out ?? 0
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Referrals</h1>
          <p className="text-muted-foreground">
            Manage referrers and track commission balances
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Referrer
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalStats?.total_referrers ?? 0}</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(globalStats?.total_earned ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid Out</CardTitle>
            <PhilippinePeso className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(globalStats?.total_paid_out ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Balance Owed</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(globalStats?.total_balance ?? 0) > 0 ? 'text-orange-500' : ''}`}>
              {formatCurrency(globalStats?.total_balance ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referrers List */}
      <Card>
        <CardHeader>
          <CardTitle>Referrer List</CardTitle>
          <CardDescription>
            View and manage referrers ({referrersData?.total ?? 0} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by name, phone, or profession..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch
                id="show-inactive"
                checked={showInactive}
                onCheckedChange={(v) => {
                  setShowInactive(v)
                  setCurrentPage(1)
                }}
              />
              <label htmlFor="show-inactive" className="text-muted-foreground cursor-pointer">
                Show inactive
              </label>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : referrers.length === 0 ? (
            <div className="text-center py-8">
              <Handshake className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No referrers found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? 'Try adjusting your search'
                  : 'Add your first referrer to get started'}
              </p>
              {!searchQuery && (
                <Button onClick={handleOpenCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Referrer
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name / Profession</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Default %</TableHead>
                      <TableHead className="text-right">Earned</TableHead>
                      <TableHead className="text-right">Paid Out</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referrers.map((referrer) => {
                      const balance = getBalance(referrer.id)
                      const earned = getEarned(referrer.id)
                      const paidOut = getPaidOut(referrer.id)
                      return (
                        <TableRow key={referrer.id}>
                          <TableCell>
                            <div>
                              <Link
                                href={`/referrals/${referrer.id}`}
                                className="font-medium hover:underline hover:text-primary"
                              >
                                {referrer.name}
                              </Link>
                              {referrer.profession && (
                                <div>
                                  <Badge variant="outline" className="text-xs mt-0.5">
                                    {referrer.profession}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {referrer.phone || '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {referrer.default_commission_rate}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {earned > 0 ? formatCurrency(earned) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {paidOut > 0 ? formatCurrency(paidOut) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {balance > 0 ? (
                              <span className="text-orange-500">{formatCurrency(balance)}</span>
                            ) : balance < 0 ? (
                              <span className="text-destructive">{formatCurrency(balance)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={referrer.is_active ? 'default' : 'secondary'}>
                              {referrer.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/referrals/${referrer.id}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenEdit(referrer)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleOpenDelete(referrer)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Deactivate
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
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

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingReferrer ? 'Edit Referrer' : 'Add New Referrer'}
            </DialogTitle>
            <DialogDescription>
              {editingReferrer
                ? 'Update referrer information'
                : 'Register a new referrer for commission tracking'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ref-name">Name *</Label>
                <Input
                  id="ref-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Full name"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ref-phone">Phone</Label>
                  <Input
                    id="ref-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+63 XXX XXX XXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ref-profession">Profession</Label>
                  <Input
                    id="ref-profession"
                    value={formData.profession}
                    onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                    placeholder="e.g., Electrician"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ref-address">Address</Label>
                <Textarea
                  id="ref-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Full address"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ref-bank">Bank / GCash Details</Label>
                <Input
                  id="ref-bank"
                  value={formData.bank_details}
                  onChange={(e) => setFormData({ ...formData, bank_details: e.target.value })}
                  placeholder="GCash: 09XX-XXX-XXXX or bank account"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ref-rate">Default Commission Rate (%)</Label>
                <Input
                  id="ref-rate"
                  type="number"
                  value={formData.default_commission_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, default_commission_rate: e.target.value })
                  }
                  placeholder="e.g., 3"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>

              {editingReferrer && (
                <div className="flex items-center gap-3">
                  <Switch
                    id="ref-active"
                    checked={formData.is_active}
                    onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                  />
                  <Label htmlFor="ref-active">Active</Label>
                </div>
              )}
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
                {editingReferrer ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Referrer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate "{deletingReferrer?.name}"? They will no
              longer appear in the POS referrer dropdown. Existing commissions and payouts
              are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingReferrer(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
