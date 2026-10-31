export class ZylaProviderError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function zylaFailure(status: number, body: any) {
  const message = typeof body?.message === "string" ? body.message : `ZylaLabs request failed (${status}).`;
  return new ZylaProviderError(status, message);
}

export function preserveZylaFailure(error: unknown) {
  if (error instanceof ZylaProviderError && [401, 402, 403, 429].includes(error.status)) throw error;
  return null;
}