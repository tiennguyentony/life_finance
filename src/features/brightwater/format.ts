export function formatMoney(dollars: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

export function formatMonthLabel(month: number): string {
  return `Month ${month}`;
}
