export const CURRENCY_META = {
  USD: { symbol: '$', label: 'USD ($)', locale: 'en-US' },
  EUR: { symbol: '€', label: 'EUR (€)', locale: 'de-DE' },
  GBP: { symbol: '£', label: 'GBP (£)', locale: 'en-GB' },
  INR: { symbol: '₹', label: 'INR (₹)', locale: 'en-IN' },
};

export function formatMoney(amount, currency = 'USD', compact = false) {
  const num = Number(amount) || 0;
  const meta = CURRENCY_META[currency] || CURRENCY_META.USD;
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency,
    notation: compact && Math.abs(num) >= 100000 ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(num);
}

export function convertValue(amount, fromCurrency, toCurrency, fxRates) {
  if (fromCurrency === toCurrency) return Number(amount) || 0;
  const fromRate = fxRates?.[fromCurrency] ?? 1;
  const toRate = fxRates?.[toCurrency] ?? 1;
  return ((Number(amount) || 0) * fromRate) / toRate;
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
