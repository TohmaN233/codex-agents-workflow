/** Count model turns across all attempts; a finished attempt costs at least one. */
export function semanticTurnsConsumed(node) {
  return node.attempts.reduce((sum, attempt) => sum + (['claimed', 'running'].includes(attempt.status)
    ? attempt.completion_turns ?? 1 : Math.max(1, attempt.completion_turns ?? 1)), 0);
}
