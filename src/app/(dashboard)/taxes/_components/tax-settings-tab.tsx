'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useTaxSettings, useUpsertTaxSettings } from '@/hooks/useTaxes'

interface Props { branchId: string | null }

export function TaxSettingsTab({ branchId }: Props) {
  const { data: settings, isLoading } = useTaxSettings(branchId)
  const upsert = useUpsertTaxSettings()

  const [form, setForm] = useState({
    bir_tin:                    '',
    tax_regime:                 'comparison',
    lbt_rate:                   '1.00',
    mayors_permit_amount:       '500',
    barangay_clearance_amount:  '300',
    bir_registration_amount:    '500',
    notify_days_before:         '30,14,7,3,1',
  })

  useEffect(() => {
    if (!settings) return
    setForm({
      bir_tin:                   settings.bir_tin ?? '',
      tax_regime:                settings.tax_regime,
      lbt_rate:                  (settings.lbt_rate * 100).toFixed(2),
      mayors_permit_amount:      String(settings.mayors_permit_amount),
      barangay_clearance_amount: String(settings.barangay_clearance_amount),
      bir_registration_amount:   String(settings.bir_registration_amount),
      notify_days_before:        settings.notify_days_before.join(','),
    })
  }, [settings])

  const handleSave = async () => {
    if (!branchId) return
    try {
      await upsert.mutateAsync({
        branchId,
        updates: {
          bir_tin:                   form.bir_tin || null,
          tax_regime:                form.tax_regime as any,
          lbt_rate:                  Number(form.lbt_rate) / 100,
          mayors_permit_amount:      Number(form.mayors_permit_amount) || 0,
          barangay_clearance_amount: Number(form.barangay_clearance_amount) || 0,
          bir_registration_amount:   Number(form.bir_registration_amount) || 500,
          notify_days_before:        form.notify_days_before
            .split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0),
        },
      })
      toast.success('Tax settings saved')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings')
    }
  }

  if (isLoading) return <Skeleton className="h-60 w-full" />

  return (
    <div className="space-y-4 max-w-xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">BIR Registration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>BIR TIN</Label>
            <Input className="mt-1" placeholder="123-456-789-000"
              value={form.bir_tin}
              onChange={e => setForm(f => ({ ...f, bir_tin: e.target.value }))} />
          </div>
          <div>
            <Label>Preferred Tax Regime for Reports</Label>
            <Select value={form.tax_regime} onValueChange={v => setForm(f => ({ ...f, tax_regime: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comparison">Show all 3 options (comparison mode)</SelectItem>
                <SelectItem value="8_flat">Option A — 8% Flat Rate</SelectItem>
                <SelectItem value="graduated_osd">Option B — Graduated + OSD</SelectItem>
                <SelectItem value="graduated_itemized">Option C — Graduated + Itemized</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1 flex gap-1">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              This setting affects which regime's figures are shown on the Overview. All 3 are always visible in the Regime Comparison tab.
            </p>
          </div>
          <div>
            <Label>BIR Annual Registration Fee (₱)</Label>
            <Input className="mt-1" type="number"
              value={form.bir_registration_amount}
              onChange={e => setForm(f => ({ ...f, bir_registration_amount: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Local Government Unit (LGU) — Talakag, Bukidnon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Local Business Tax Rate (%)</Label>
            <Input className="mt-1" step="0.01" placeholder="1.00"
              value={form.lbt_rate}
              onChange={e => setForm(f => ({ ...f, lbt_rate: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">
              Enter the actual rate from Talakag's Local Revenue Code. LGC maximum for your gross sales bracket is used if you leave this higher. Default: 1.00% (maximum for most brackets).
            </p>
          </div>
          <div>
            <Label>Mayor's Permit Amount (₱)</Label>
            <Input className="mt-1" type="number"
              value={form.mayors_permit_amount}
              onChange={e => setForm(f => ({ ...f, mayors_permit_amount: e.target.value }))} />
          </div>
          <div>
            <Label>Barangay Clearance Amount (₱)</Label>
            <Input className="mt-1" type="number"
              value={form.barangay_clearance_amount}
              onChange={e => setForm(f => ({ ...f, barangay_clearance_amount: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Deadline Reminders</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label>Notify me (days before deadline)</Label>
            <Input className="mt-1" placeholder="30,14,7,3,1"
              value={form.notify_days_before}
              onChange={e => setForm(f => ({ ...f, notify_days_before: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated days. Notifications appear in the system bell for Admin, Manager, and Accountant roles.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={upsert.isPending} className="w-full">
        <Save className="mr-2 h-4 w-4" />
        {upsert.isPending ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  )
}
