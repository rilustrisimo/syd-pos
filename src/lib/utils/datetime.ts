/**
 * Date and time utilities with Philippine timezone (GMT+8) support
 */

/**
 * Get current date and time in Philippine timezone
 * @returns Date object representing current time in Manila
 */
export function getNowInPH(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
}

/**
 * Get today's date in YYYY-MM-DD format (Philippine timezone)
 * @returns Date string in ISO format (date only)
 */
export function getTodayPH(): string {
  return getNowInPH().toISOString().split('T')[0]
}

/**
 * Format a date for display in Philippine locale
 * @param date - Date to format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDatePH(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleDateString('en-PH', {
    ...options,
    timeZone: 'Asia/Manila',
  })
}

/**
 * Format a date and time for display in Philippine locale
 * @param date - Date to format
 * @returns Formatted date and time string
 */
export function formatDateTimePH(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  })
}

/**
 * Check if a date string (YYYY-MM-DD) is today in Philippine timezone
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns True if the date is today
 */
export function isTodayPH(dateString: string): boolean {
  return dateString === getTodayPH()
}

/**
 * Create an ISO timestamp for a given date string
 * - If the date is today, uses current time
 * - If the date is in the past, uses midnight of that date
 * Both in Philippine timezone
 * 
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns ISO timestamp string
 */
export function createTimestampPH(dateString: string): string {
  if (!dateString) return new Date().toISOString()
  
  if (isTodayPH(dateString)) {
    // Use current timestamp for today's transactions
    return getNowInPH().toISOString()
  } else {
    // Use midnight for backdated transactions
    const backdatedDate = new Date(dateString + 'T00:00:00+08:00')
    return backdatedDate.toISOString()
  }
}
