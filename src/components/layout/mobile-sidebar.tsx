'use client'

import { useSidebarStore } from '@/lib/stores/sidebar'
import { SidebarContent } from '@/components/layout/sidebar'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'

export function MobileSidebar() {
  const { isOpen, close } = useSidebarStore()

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="left"
        className="w-64 p-0 bg-slate-900 text-white border-slate-800"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SidebarContent onNavigate={close} />
      </SheetContent>
    </Sheet>
  )
}
