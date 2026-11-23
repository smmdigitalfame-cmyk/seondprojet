/** Optional public stats must not hold a completed paid clone indefinitely. */
export function boundedEnrichment<T>(task: Promise<T>, fallback: T, waitMs = 1500): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), waitMs);
    task.then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}