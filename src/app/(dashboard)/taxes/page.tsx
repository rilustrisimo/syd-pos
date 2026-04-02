'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LayoutDashboard, CalendarDays, TrendingUp, Receipt, Settings } from 'lucide-react'
import { usePOSStore } from '@/lib/stores/posStore'
import { OverviewTab }    from './_components/overview-tab'
import { QuarterlyTab }   from './_components/quarterly-tab'
import { ComparisonTab }  from './_components/comparison-tab'
import { PaymentLogTab }  from './_components/payment-log-tab'
import { TaxSettingsTab } from './_components/tax-settings-tab'

export default function TaxesPage() {
  const { branchId } = usePOSStore()
  const currentYear  = new Date().getFullYear()
  const [year, setYear]         = useState(currentYear)
  const [quarter, setQuarter]   = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [activeTab, setActiveTab] = useState('overview')

  // Keep year in sync if user navigates here in a new year
  useEffect(() => { setYear(new Date().getFullYear()) }, [])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tax Compliance</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            BIR filings, LGU fees, and government obligations — Talakag, Bukidnon
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Non-VAT Sole Proprietor</span>
          <span>·</span>
          <select
            className="border rounded px-2 py-1 text-sm bg-background"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview"    className="flex items-center gap-1.5 text-xs">
            <LayoutDashboard className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="quarterly"   className="flex items-center gap-1.5 text-xs">
            <CalendarDays className="h-3.5 w-3.5" /> Quarterly
          </TabsTrigger>
          <TabsTrigger value="comparison"  className="flex items-center gap-1.5 text-xs">
            <TrendingUp className="h-3.5 w-3.5" /> Regime Comparison
          </TabsTrigger>
          <TabsTrigger value="payments"    className="flex items-center gap-1.5 text-xs">
            <Receipt className="h-3.5 w-3.5" /> Payment Log
          </TabsTrigger>
          <TabsTrigger value="settings"    className="flex items-center gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab branchId={branchId} year={year} onNavigate={setActiveTab} />
        </TabsContent>
        <TabsContent value="quarterly">
          <QuarterlyTab branchId={branchId} year={year} quarter={quarter} onQuarterChange={setQuarter} />
        </TabsContent>
        <TabsContent value="comparison">
          <ComparisonTab branchId={branchId} year={year} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentLogTab branchId={branchId} year={year} />
        </TabsContent>
        <TabsContent value="settings">
          <TaxSettingsTab branchId={branchId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
