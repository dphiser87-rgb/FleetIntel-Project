export const CURRENCIES = {
  USD: { symbol: "$", label: "US Dollar" },
  ZAR: { symbol: "R", label: "South African Rand" },
  NGN: { symbol: "₦", label: "Nigerian Naira" },
  KES: { symbol: "KSh", label: "Kenyan Shilling" },
  GHS: { symbol: "GH₵", label: "Ghanaian Cedi" },
  EGP: { symbol: "E£", label: "Egyptian Pound" },
  MAD: { symbol: "DH", label: "Moroccan Dirham" },
  TZS: { symbol: "TSh", label: "Tanzanian Shilling" },
  UGX: { symbol: "USh", label: "Ugandan Shilling" },
  ETB: { symbol: "Br", label: "Ethiopian Birr" },
};

export function formatMoney(value, code = "USD") {
  const symbol = CURRENCIES[code]?.symbol ?? "$";
  const n = Number(value || 0);
  const abbrev = Math.abs(n) >= 1000
    ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
    : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${symbol}${abbrev}`;
}

export function formatMoneyFull(value, code = "USD") {
  const symbol = CURRENCIES[code]?.symbol ?? "$";
  return `${symbol}${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
