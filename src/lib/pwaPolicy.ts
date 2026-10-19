export function canRegisterAppWorker(production: boolean, hostname: string, embedded: boolean, search: string): boolean {
  const previewDomains = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
  const preview = hostname.startsWith("id-preview--") || hostname.startsWith("preview--") ||
    previewDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  return production && !embedded && !preview && new URLSearchParams(search).get("sw") !== "off";
}