'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Textarea } from '@/components/ui/textarea'
import { User, Building, Bell, Lock, Loader2, Percent, Plus, Trash2, Pencil, Check, X, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { useDiscountRules, useCreateDiscountRule, useUpdateDiscountRule, useDeleteDiscountRule } from '@/hooks/useDiscountRules'
import type { DiscountRule } from '@/lib/supabase/queries/discount-rules'
import { useStoreContactInfo, useUpdateStoreContactInfo } from '@/hooks/useShopSettings'

function StoreContactCard() {
  const { data: info, isLoading } = useStoreContactInfo()
  const updateInfo = useUpdateStoreContactInfo()

  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  // Populate the form once the settings load — a plain effect, not a
  // controlled-by-query field, since the admin needs to be able to edit
  // freely without every keystroke racing the query cache.
  useEffect(() => {
    if (info) {
      setAddress(info.store_address)
      setPhone(info.store_phone)
    }
  }, [info])

  const handleSave = async () => {
    if (!info?.id) {
      toast.error('Store settings not loaded yet')
      return
    }
    try {
      await updateInfo.mutateAsync({ id: info.id, store_address: address, store_phone: phone })
      toast.success('Store contact info updated')
    } catch (e: any) {
      toast.error(e.message || 'Failed to update store contact info')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          <div>
            <CardTitle>Store Contact & Address</CardTitle>
            <CardDescription className="mt-1">
              Printed on the delivery slip, pickup slip, and other internal documents — and shared
              live with the online shop (syd-shop), so it only needs to be set in one place.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Store Address</Label>
              <Textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="e.g. Sitio Landing, Talakag, Bukidnon"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 09765524334"
              />
              <p className="text-xs text-muted-foreground">
                A single number — this replaces the two numbers previously printed side by side.
              </p>
            </div>
            <Button onClick={handleSave} disabled={updateInfo.isPending}>
              {updateInfo.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DiscountRulesCard() {
  const { data: rules = [], isLoading } = useDiscountRules()
  const createRule = useCreateDiscountRule()
  const updateRule = useUpdateDiscountRule()
  const deleteRule = useDeleteDiscountRule()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const blankForm = { name: '', markup_min: '', markup_max: '', discount_percentage: '', sort_order: '' }
  const [form, setForm] = useState(blankForm)
  const [editForm, setEditForm] = useState<Record<string, string>>({})

  const handleAdd = async () => {
    if (!form.name || form.markup_min === '' || form.discount_percentage === '') {
      toast.error('Name, minimum markup, and discount % are required')
      return
    }
    try {
      await createRule.mutateAsync({
        name: form.name,
        markup_min: parseFloat(form.markup_min),
        markup_max: form.markup_max !== '' ? parseFloat(form.markup_max) : null,
        discount_percentage: parseFloat(form.discount_percentage),
        sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : 0,
      })
      toast.success('Discount rule added')
      setForm(blankForm)
      setShowAddForm(false)
    } catch (e: any) {
      toast.error(e.message || 'Failed to add rule')
    }
  }

  const handleEditSave = async (id: string) => {
    try {
      await updateRule.mutateAsync({
        id,
        updates: {
          name: editForm.name,
          markup_min: parseFloat(editForm.markup_min),
          markup_max: editForm.markup_max !== '' ? parseFloat(editForm.markup_max) : null,
          discount_percentage: parseFloat(editForm.discount_percentage),
          sort_order: editForm.sort_order !== '' ? parseInt(editForm.sort_order) : 0,
        },
      })
      toast.success('Rule updated')
      setEditingId(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to update rule')
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await deleteRule.mutateAsync(deletingId)
      toast.success('Rule deleted')
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete rule')
    } finally {
      setDeletingId(null)
    }
  }

  const startEdit = (rule: DiscountRule) => {
    setEditingId(rule.id)
    setEditForm({
      name: rule.name,
      markup_min: String(rule.markup_min),
      markup_max: rule.markup_max !== null ? String(rule.markup_max) : '',
      discount_percentage: String(rule.discount_percentage),
      sort_order: String(rule.sort_order),
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              <div>
                <CardTitle>Standard Discount Rules</CardTitle>
                <CardDescription className="mt-1">
                  Define automatic discounts applied per item based on product markup range.
                  Used when cashier selects "Standard" discount in POS checkout.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => setShowAddForm((v) => !v)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddForm && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
              <p className="text-sm font-medium">New Rule</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <div className="col-span-2 md:col-span-1 space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input placeholder="e.g. Low Markup" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Markup Min (%)</Label>
                  <NumericInput min="0" placeholder="0" value={form.markup_min} onChange={(e) => setForm({ ...form, markup_min: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Markup Max (% or blank = ∞)</Label>
                  <NumericInput min="0" placeholder="∞" value={form.markup_max} onChange={(e) => setForm({ ...form, markup_max: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Discount (%)</Label>
                  <NumericInput min="0" max="100" step="0.01" placeholder="e.g. 2" value={form.discount_percentage} onChange={(e) => setForm({ ...form, discount_percentage: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sort Order</Label>
                  <NumericInput min="0" placeholder="0" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setShowAddForm(false); setForm(blankForm) }}>Cancel</Button>
                <Button size="sm" onClick={handleAdd} disabled={createRule.isPending}>
                  {createRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Rule'}
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No discount rules yet. Add one above.</p>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Markup Min</TableHead>
                    <TableHead className="text-right">Markup Max</TableHead>
                    <TableHead className="text-right">Discount %</TableHead>
                    <TableHead className="text-right">Sort</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) =>
                    editingId === rule.id ? (
                      <TableRow key={rule.id}>
                        <TableCell><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-8" /></TableCell>
                        <TableCell><NumericInput value={editForm.markup_min} onChange={(e) => setEditForm({ ...editForm, markup_min: e.target.value })} className="h-8 w-20 ml-auto" /></TableCell>
                        <TableCell><NumericInput value={editForm.markup_max} placeholder="∞" onChange={(e) => setEditForm({ ...editForm, markup_max: e.target.value })} className="h-8 w-20 ml-auto" /></TableCell>
                        <TableCell><NumericInput value={editForm.discount_percentage} onChange={(e) => setEditForm({ ...editForm, discount_percentage: e.target.value })} className="h-8 w-20 ml-auto" /></TableCell>
                        <TableCell><NumericInput value={editForm.sort_order} onChange={(e) => setEditForm({ ...editForm, sort_order: e.target.value })} className="h-8 w-16 ml-auto" /></TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditSave(rule.id)} disabled={updateRule.isPending}>
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell className="text-right font-mono">{rule.markup_min}%</TableCell>
                        <TableCell className="text-right font-mono">{rule.markup_max !== null ? `${rule.markup_max}%` : '∞'}</TableCell>
                        <TableCell className="text-right font-mono text-green-700 font-semibold">{rule.discount_percentage}%</TableCell>
                        <TableCell className="text-right text-muted-foreground">{rule.sort_order}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(rule)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingId(rule.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Rules are matched top-to-bottom by sort order. The first matching rule applies. Markup Max blank = no upper limit.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete discount rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This rule will no longer be applied to standard discounts in POS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and application settings</p>
      </div>

      {/* Discount Rules — full width */}
      <DiscountRulesCard />

      {/* Store Contact & Address — full width */}
      <StoreContactCard />

      <div className="grid gap-6 md:grid-cols-2">

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <CardTitle>Profile Settings</CardTitle>
            </div>
            <CardDescription>
              Manage your profile information and preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Edit Profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <CardTitle>Security</CardTitle>
            </div>
            <CardDescription>
              Update your password and security settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Change Password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              <CardTitle>Branch Settings</CardTitle>
            </div>
            <CardDescription>
              Configure your branch information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" disabled>
              Manage Branch
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>
              Configure notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" disabled>
              Configure Notifications
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
