// Admin and paid issuers both use four-character alphanumeric groups.
export function isInstagramAccessKey(value: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}