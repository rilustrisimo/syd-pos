/**
 * Supabase Edge Function: send-payment-reminders
 *
 * Called daily by pg_cron at 8:00 AM Philippine time (00:00 UTC).
 * Scans liability_payables and liability_loan_schedule for items
 * due within configured reminder windows, creates in-app notifications,
 * and sends emails via Resend to Admin / Manager / Accountant users.
 *
 * Env vars (set via `supabase secrets set`):
 *   RESEND_API_KEY
 *   APP_FROM_EMAIL   (e.g. noreply@sydconstruction.com)
 *   APP_NAME         (e.g. SYD POS)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('APP_FROM_EMAIL') ?? 'noreply@sydconstruction.com'
const APP_NAME = Deno.env.get('APP_NAME') ?? 'SYD POS'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    // Load notification settings
    const { data: settings } = await supabase
      .from('notification_settings')
      .select('entity_type, reminder_days, email_enabled, in_app_enabled')

    const getSettings = (entityType: string) =>
      settings?.find(s => s.entity_type === entityType) ?? {
        reminder_days: [7, 3, 1, 0],
        email_enabled: true,
        in_app_enabled: true,
      }

    // Get eligible users (admin, manager, accountant)
    const { data: eligibleUsers } = await supabase
      .from('users')
      .select('id, email, full_name, role, branch_id')
      .in('role', ['admin', 'manager', 'accountant'])
      .eq('is_active', true)

    let notificationsCreated = 0
    let emailsSent = 0

    // ── Process payables ──────────────────────────────────────────────────────

    const payableSettings = getSettings('liability_payable')
    const maxPayableDays = Math.max(...(payableSettings.reminder_days as number[]))
    const futurePayableDate = new Date(today)
    futurePayableDate.setDate(futurePayableDate.getDate() + maxPayableDays)

    const { data: payables } = await supabase
      .from('liability_payables')
      .select('id, payable_number, description, total_amount, paid_amount, due_date, branch_id, supplier:suppliers(name)')
      .eq('is_deleted', false)
      .in('status', ['unpaid', 'partial'])
      .lte('due_date', futurePayableDate.toISOString().split('T')[0])

    for (const payable of payables ?? []) {
      const dueDate = new Date(payable.due_date as string)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      if (!(payableSettings.reminder_days as number[]).includes(daysUntilDue) && daysUntilDue >= 0) continue

      const supplierName = (payable.supplier as { name: string } | null)?.name ?? 'Supplier'
      const balance = (payable.total_amount as number) - (payable.paid_amount as number)
      const isOverdue = daysUntilDue < 0

      const notifType = isOverdue ? 'payable_overdue' : 'payable_due'
      const dueDateFmt = new Date(payable.due_date as string).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
      const title = isOverdue
        ? `OVERDUE: Payment to ${supplierName}`
        : `Payment Due${daysUntilDue === 0 ? ' Today' : ` in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`}`
      const message = isOverdue
        ? `${payable.payable_number} — ₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })} owed to ${supplierName} was due on ${dueDateFmt}.`
        : `${payable.payable_number} — ₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })} owed to ${supplierName} is due on ${dueDateFmt}.`

      // Check if we already sent this specific reminder today (prevent duplicates)
      const { count: existingCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'liability_payable')
        .eq('entity_id', payable.id)
        .eq('type', notifType)
        .gte('created_at', `${todayStr}T00:00:00Z`)

      if ((existingCount ?? 0) > 0) continue

      // Create in-app notification
      if (payableSettings.in_app_enabled) {
        await supabase.from('notifications').insert({
          type: notifType,
          title,
          message,
          entity_type: 'liability_payable',
          entity_id: payable.id,
          target_roles: ['admin', 'manager', 'accountant'],
          branch_id: payable.branch_id,
          metadata: { balance, days_until_due: daysUntilDue, supplier_name: supplierName, payable_number: payable.payable_number },
        })
        notificationsCreated++
      }

      // Send emails
      if (payableSettings.email_enabled) {
        const recipients = (eligibleUsers ?? []).filter(u =>
          !u.branch_id || u.branch_id === payable.branch_id
        )

        for (const user of recipients) {
          await sendEmail(
            user.email as string,
            user.full_name as string | null,
            title,
            buildPayableEmailHtml({ title, message, payable_number: payable.payable_number as string, supplier_name: supplierName, balance, due_date: dueDateFmt, is_overdue: isOverdue })
          )
          emailsSent++
        }
      }
    }

    // ── Process loan installments ─────────────────────────────────────────────

    const loanSettings = getSettings('liability_loan_schedule')
    const maxLoanDays = Math.max(...(loanSettings.reminder_days as number[]))
    const futureLoanDate = new Date(today)
    futureLoanDate.setDate(futureLoanDate.getDate() + maxLoanDays)

    const { data: installments } = await supabase
      .from('liability_loan_schedule')
      .select(`
        id, loan_id, installment_number, scheduled_amount, paid_amount, due_date,
        loan:liability_loans(loan_number, lender_name, branch_id, is_deleted)
      `)
      .in('status', ['upcoming', 'partial'])
      .lte('due_date', futureLoanDate.toISOString().split('T')[0])

    for (const installment of installments ?? []) {
      const loan = installment.loan as { loan_number: string; lender_name: string; branch_id: string; is_deleted: boolean } | null
      if (!loan || loan.is_deleted) continue

      const dueDate = new Date(installment.due_date as string)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      if (!(loanSettings.reminder_days as number[]).includes(daysUntilDue) && daysUntilDue >= 0) continue

      const remaining = (installment.scheduled_amount as number) - (installment.paid_amount as number)
      const isOverdue = daysUntilDue < 0
      const dueDateFmt = new Date(installment.due_date as string).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

      const notifType = isOverdue ? 'loan_payment_overdue' : 'loan_payment_due'
      const title = isOverdue
        ? `OVERDUE: Loan Installment #${installment.installment_number} (${loan.loan_number})`
        : `Loan Installment #${installment.installment_number} Due${daysUntilDue === 0 ? ' Today' : ` in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`}`
      const message = isOverdue
        ? `${loan.loan_number} Installment #${installment.installment_number} — ₱${remaining.toLocaleString('en-PH', { minimumFractionDigits: 2 })} to ${loan.lender_name} was due on ${dueDateFmt}.`
        : `${loan.loan_number} Installment #${installment.installment_number} — ₱${remaining.toLocaleString('en-PH', { minimumFractionDigits: 2 })} to ${loan.lender_name} is due on ${dueDateFmt}.`

      const { count: existingCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'liability_loan_schedule')
        .eq('entity_id', installment.id)
        .eq('type', notifType)
        .gte('created_at', `${todayStr}T00:00:00Z`)

      if ((existingCount ?? 0) > 0) continue

      if (loanSettings.in_app_enabled) {
        await supabase.from('notifications').insert({
          type: notifType,
          title,
          message,
          entity_type: 'liability_loan_schedule',
          entity_id: installment.id,
          target_roles: ['admin', 'manager', 'accountant'],
          branch_id: loan.branch_id,
          metadata: { remaining, days_until_due: daysUntilDue, lender_name: loan.lender_name, loan_number: loan.loan_number, installment_number: installment.installment_number },
        })
        notificationsCreated++
      }

      if (loanSettings.email_enabled) {
        const recipients = (eligibleUsers ?? []).filter(u =>
          !u.branch_id || u.branch_id === loan.branch_id
        )

        for (const user of recipients) {
          await sendEmail(
            user.email as string,
            user.full_name as string | null,
            title,
            buildLoanEmailHtml({ title, message, loan_number: loan.loan_number, lender_name: loan.lender_name, installment_number: installment.installment_number as number, remaining, due_date: dueDateFmt, is_overdue: isOverdue })
          )
          emailsSent++
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, notifications_created: notificationsCreated, emails_sent: emailsSent }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-payment-reminders error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// ── Email sender ──────────────────────────────────────────────────────────────

async function sendEmail(to: string, name: string | null, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`Resend email failed for ${to}:`, body)
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

function baseTemplate(content: string, isOverdue: boolean): string {
  const accentColor = isOverdue ? '#ef4444' : '#ffc107'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
      <tr><td style="background:#1e293b;padding:24px 32px">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;color:${accentColor}">SYD CONSTRUCTION SUPPLIES</p>
        <p style="margin:4px 0 0;font-size:13px;color:#94a3b8">${APP_NAME} — Financial Notification</p>
      </td></tr>
      <tr><td style="padding:32px">
        ${content}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="margin:0;font-size:12px;color:#94a3b8">This is an automated reminder from ${APP_NAME}. Please do not reply to this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

function buildPayableEmailHtml(params: {
  title: string; message: string; payable_number: string; supplier_name: string;
  balance: number; due_date: string; is_overdue: boolean
}): string {
  const { title, message, payable_number, supplier_name, balance, due_date, is_overdue } = params
  const badgeColor = is_overdue ? '#fee2e2' : '#fef9c3'
  const badgeTextColor = is_overdue ? '#dc2626' : '#92400e'
  const badgeLabel = is_overdue ? 'OVERDUE' : 'DUE SOON'
  const content = `
    <span style="display:inline-block;background:${badgeColor};color:${badgeTextColor};font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:0.5px">${badgeLabel}</span>
    <h2 style="margin:16px 0 8px;font-size:20px;color:#1e293b">${title}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6">${message}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:6px;padding:16px">
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b;width:140px">Payable No.</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1e293b;font-family:monospace">${payable_number}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b">Supplier</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1e293b">${supplier_name}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b">Balance Due</td><td style="padding:6px 0;font-size:15px;font-weight:700;color:#1e293b">₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b">Due Date</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:${is_overdue ? '#dc2626' : '#1e293b'}">${due_date}</td></tr>
    </table>`
  return baseTemplate(content, is_overdue)
}

function buildLoanEmailHtml(params: {
  title: string; message: string; loan_number: string; lender_name: string;
  installment_number: number; remaining: number; due_date: string; is_overdue: boolean
}): string {
  const { title, message, loan_number, lender_name, installment_number, remaining, due_date, is_overdue } = params
  const badgeColor = is_overdue ? '#fee2e2' : '#ede9fe'
  const badgeTextColor = is_overdue ? '#dc2626' : '#7c3aed'
  const badgeLabel = is_overdue ? 'OVERDUE' : 'DUE SOON'
  const content = `
    <span style="display:inline-block;background:${badgeColor};color:${badgeTextColor};font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:0.5px">${badgeLabel}</span>
    <h2 style="margin:16px 0 8px;font-size:20px;color:#1e293b">${title}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6">${message}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:6px;padding:16px">
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b;width:140px">Loan No.</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1e293b;font-family:monospace">${loan_number}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b">Lender</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1e293b">${lender_name}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b">Installment #</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1e293b">${installment_number}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b">Amount Due</td><td style="padding:6px 0;font-size:15px;font-weight:700;color:#1e293b">₱${remaining.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#64748b">Due Date</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:${is_overdue ? '#dc2626' : '#1e293b'}">${due_date}</td></tr>
    </table>`
  return baseTemplate(content, is_overdue)
}
