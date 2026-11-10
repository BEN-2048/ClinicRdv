let sessionGeneration = 0;

export function invalidateOfflineSync(): void {
  sessionGeneration += 1;
}

export function getOfflineSyncGeneration(): number {
  return sessionGeneration;
}

export function isOfflineSyncGenerationValid(
  generation: number,
): boolean {
  return generation === sessionGeneration;
}
let operationQueue: Promise<void> = Promise.resolve();

export async function runOfflineSyncExclusive<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previousOperation = operationQueue;

  let release!: () => void;

  operationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previousOperation;

  try {
    return await operation();
  } finally {
    release();
  }
}