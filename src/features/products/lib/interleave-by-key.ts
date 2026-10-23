/**
 * Round-robin mix of already-ordered items by a group key (e.g. the shop), so
 * a page shows Shop One, Shop Two, Shop One, ... instead of one shop's block
 * followed by the other's. Each group keeps its own order, groups take turns
 * in order of first appearance, and a group that runs out simply drops out.
 * Deterministic on purpose (no randomness): the same page renders the same
 * every time, so caching and back/forward navigation stay stable.
 */
export function interleaveByKey<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const queues = [...groups.values()];
  const result: T[] = [];
  for (let round = 0; result.length < items.length; round += 1) {
    for (const queue of queues) {
      if (round < queue.length) result.push(queue[round]);
    }
  }
  return result;
}
