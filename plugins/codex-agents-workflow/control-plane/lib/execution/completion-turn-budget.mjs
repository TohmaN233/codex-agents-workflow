/** Count model turns across all attempts; a finished attempt costs at least one. */
export function semanticTurnsConsumed(node) {
  return node.attempts.reduce((sum, attempt) => sum + (['claimed', 'running'].includes(attempt.status)
    ? attempt.completion_turns ?? 1 : Math.max(1, attempt.completion_turns ?? 1)), 0);
}

export function nativeAttemptTurns(attempt) {
  const rejected=Object.values(attempt.native_rejected_turns??{});
  return Math.max(1,...rejected.map(slot=>slot.count??slot.turns?.length??1));
}

export function nativeTurnsConsumed(node) {
  return node.attempts.reduce((sum,attempt)=>sum+nativeAttemptTurns(attempt),0);
}
