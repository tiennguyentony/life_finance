export function safeAuthRedirectPath(value: string | null): string {
  return value === "/start" || value === "/auth/complete"
    ? value
    : "/auth/complete";
}
