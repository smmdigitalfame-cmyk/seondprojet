export function instagramFailureMessage(status: number, body: string, username: string): string {
  let code = "";
  try {
    const parsed = JSON.parse(body);
    code = String(parsed?.error || "");
    if (code === "provider_request_failed" && typeof parsed.message === "string") return parsed.message;
  } catch { /* gateway text */ }
  if (code === "account_private") return `Account @${username} is private.`;
  if (code === "account_not_found") return `Account @${username} was not found.`;
  // A gateway 404 or a legacy scraper's ambiguous not_found is not evidence
  // that an account is missing: all its upstreams may simply be unavailable.
  if (status === 404 || status >= 500 || code === "not_found" || code === "provider_unavailable") {
    return `Instagram data for @${username} is temporarily unavailable. Please try again later.`;
  }
  return `Unable to load Instagram data (${status}). Please try again.`;
}