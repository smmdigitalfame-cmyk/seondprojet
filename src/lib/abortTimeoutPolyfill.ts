// Older Android WebViews/browsers lack AbortSignal.timeout; add a safe fallback.
if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout !== "function") {
  (AbortSignal as any).timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => {
      try {
        controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
      } catch {
        controller.abort();
      }
    }, ms);
    return controller.signal;
  };
}
export {};
