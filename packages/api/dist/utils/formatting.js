export const formatCurrency = (amount, decimals = 2) => {
    return `₱${amount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};
export const formatDate = (date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
    });
};
export const formatTime = (date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};
export const formatDateTime = (date) => {
    return `${formatDate(date)} ${formatTime(date)}`;
};
export const formatNumber = (num, decimals = 0) => {
    return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
export const formatPercent = (num, decimals = 2) => {
    return `${num.toFixed(decimals)}%`;
};
export const parseCurrency = (str) => {
    return parseFloat(str.replace(/[^\d.-]/g, ''));
};
export const truncate = (str, maxLength) => {
    if (str.length <= maxLength)
        return str;
    return str.slice(0, maxLength - 3) + '...';
};
export const capitalize = (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
};
export const formatProductCode = (code) => {
    return code.toUpperCase().trim();
};
export const formatPhone = (phone) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
        return `+63${digits.slice(1)}`;
    }
    if (digits.length === 11 && digits.startsWith('0')) {
        return `+63${digits.slice(1)}`;
    }
    if (digits.length === 12 && digits.startsWith('63')) {
        return `+${digits}`;
    }
    return phone;
};
export const formatCustomerName = (name) => {
    return name
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};
export const getInitials = (name) => {
    return name
        .split(' ')
        .map((word) => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};
export const isNumeric = (value) => {
    return !isNaN(parseFloat(value)) && isFinite(value);
};
export const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
export const isValidPhone = (phone) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 12;
};
export const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (hours > 0)
        parts.push(`${hours}h`);
    if (minutes > 0)
        parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0)
        parts.push(`${secs}s`);
    return parts.join(' ');
};
export const getRelativeTime = (date) => {
    const now = new Date();
    const d = typeof date === 'string' ? new Date(date) : date;
    const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (seconds < 60)
        return 'just now';
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400)
        return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800)
        return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(d);
};
export default {
    formatCurrency,
    formatDate,
    formatTime,
    formatDateTime,
    formatNumber,
    formatPercent,
    parseCurrency,
    truncate,
    capitalize,
    formatProductCode,
    formatPhone,
    formatCustomerName,
    getInitials,
    isNumeric,
    isValidEmail,
    isValidPhone,
    formatDuration,
    getRelativeTime,
};
//# sourceMappingURL=formatting.js.map