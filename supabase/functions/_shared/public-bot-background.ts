// Only best-effort reporting belongs here; purchases and customer delivery remain awaited.
type BackgroundRuntime = { waitUntil: (task: Promise<unknown>) => void };
export async function runBotReporting(task: Promise<unknown>, runtime?: BackgroundRuntime) {
  const safeTask = task.catch(() => { console.error('Public bot reporting pending'); });
  if (runtime) runtime.waitUntil(safeTask);
  else await safeTask;
}