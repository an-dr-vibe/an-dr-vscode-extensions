/** Resolves work items while retaining input order and a bounded worker count. */
export async function evalPromises<X, Y>(
  data: X[],
  maxParallel: number,
  createPromise: (val: X) => Promise<Y>
): Promise<Y[]> {
  const results: Y[] = Array.from({ length: data.length });
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(maxParallel, 1), data.length);

  function work(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= data.length) {
      return Promise.resolve();
    }
    return createPromise(data[index]).then((result) => {
      results[index] = result;
      return work();
    });
  }

  await Promise.all(Array.from({ length: workerCount }, work));
  return results;
}
