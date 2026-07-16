export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSignedMoney(value: number): string {
  const absolute = formatMoney(Math.abs(value));
  if (value === 0) return absolute;
  return `${value > 0 ? "+" : "-"}${absolute}`;
}

export function formatChangeValue(id: string, value: number): string {
  if (id === "vulnerability") return `${value}/100`;
  if (id === "runway") return `${value.toFixed(1)} months`;
  return formatMoney(value);
}
