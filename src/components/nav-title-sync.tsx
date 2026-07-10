'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/pos': 'Point of Sale',
  '/pos/history': 'Transaction History',
  '/pos/canvas': 'Canvas Orders',
  '/pos/returns': 'Returns',
  '/inventory': 'Inventory',
  '/inventory/adjust': 'Stock Adjustment',
  '/inventory/alerts': 'Low Stock Alerts',
  '/inventory/movements': 'Stock Movements',
  '/inventory/stocktake': 'Stocktake',
  '/products': 'Products',
  '/products/new': 'New Product',
  '/products/categories': 'Categories',
  '/customers': 'Customers',
  '/purchases': 'Purchases',
  '/purchases/new': 'New Purchase',
  '/purchases/reorder': 'Reorder Suggestions',
  '/orders/online': 'Online Orders',
  '/reports': 'Reports',
  '/reports/sales': 'Sales Report',
  '/reports/pl': 'Profit & Loss',
  '/reports/demand-forecast': 'Demand Forecast',
  '/reports/inventory-turnover': 'Inventory Turnover',
  '/reports/ar-aging': 'AR Aging',
  '/reports/ap-aging': 'AP Aging',
  '/reports/profit-margin': 'Profit Margins',
  '/settings': 'Settings',
  '/suppliers': 'Suppliers',
  '/employees': 'Employees',
  '/employees/payroll': 'Payroll',
  '/expenses': 'Expenses',
  '/expenses/categories': 'Expense Categories',
  '/taxes': 'Tax Settings',
  '/liabilities': 'Liabilities',
  '/liabilities/loans': 'Loans',
  '/liabilities/payables': 'Payables',
  '/liabilities/cashflow': 'Cash Flow',
  '/referrals': 'Referrals',
  '/government': 'Government Sales',
  '/government/canvass': 'Canvass',
  '/government/sales': 'Government Sales',
}

/** Sets document.title based on current pathname. Mount this once in the dashboard layout.
 *  Individual pages can override by setting document.title themselves (runs after layout effects). */
export function NavTitleSync() {
  const pathname = usePathname()

  useEffect(() => {
    const exact = TITLES[pathname]
    if (exact) {
      document.title = `${exact} · SYD POS`
      return
    }

    // For dynamic routes (/products/[id], /customers/[id], etc.),
    // find the closest parent path in the map.
    const parts = pathname.split('/').filter(Boolean)
    for (let len = parts.length - 1; len > 0; len--) {
      const parentPath = '/' + parts.slice(0, len).join('/')
      if (TITLES[parentPath]) {
        document.title = `${TITLES[parentPath]} · SYD POS`
        return
      }
    }

    document.title = 'SYD POS'
  }, [pathname])

  return null
}
