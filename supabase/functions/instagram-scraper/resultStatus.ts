/** Empty provider responses do not prove an Instagram account is missing. */
export function unavailableResult(username: string) {
  return {
    status: 503,
    body: {
      error: "provider_unavailable",
      message: `Instagram data for @${username} could not be retrieved right now. Please try again later.`,
    },
  };
}