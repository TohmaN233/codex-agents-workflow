// One publication per refresh: state, next, events and live never mix generations.
export function createRunRefresh() {
  let generation = 0;
  let sequence = -1;
  let active = true;
  let previous = null;
  return {
    invalidate() { generation += 1; },
    activate() { active = true; generation += 1; },
    dispose() { active = false; generation += 1; },
    async refresh(load, publish) {
      if (!active) return false;
      const request = ++generation;
      let snapshot;
      try { snapshot = await load(previous); }
      catch (error) { if (request === generation) throw error; return false; }
      if (request !== generation || snapshot.state.sequence < sequence) return false;
      sequence = snapshot.state.sequence;
      previous = snapshot;
      publish(snapshot);
      return true;
    },
  };
}


// Only the previously published generation can advance this event cursor.
export async function loadRunSnapshot(api, runId, authority, previous) {
  const priorEvents = authority && previous?.eventAuthority === authority ? previous.events : [];
  const after_sequence = priorEvents?.at(-1)?.sequence ?? 0;
  const next = await api('run_snapshot', { run_id: runId, control_token: authority, after_sequence });
  if (next.state.sequence < after_sequence) throw new Error('Run snapshot sequence regressed behind the event cursor');
  return { ...next, events: [...(priorEvents ?? []), ...next.events], eventAuthority: authority };
}
