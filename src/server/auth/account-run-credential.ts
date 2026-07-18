const ACCOUNT_CREDENTIAL_PREFIX = "lf_account:";

export function accountRunCredential(userId: string): string {
  return `${ACCOUNT_CREDENTIAL_PREFIX}${userId}`;
}

export function accountIdFromRunCredential(credential: string): string | null {
  if (!credential.startsWith(ACCOUNT_CREDENTIAL_PREFIX)) return null;
  const userId = credential.slice(ACCOUNT_CREDENTIAL_PREFIX.length);
  return userId.length > 0 ? userId : null;
}
