// One publication per refresh: state, next, events and live never mix generations.
export function createRunRefresh() {
  let generation = 0;
  let sequence = -1;
  let active = true;
  return {
    invalidate() { generation += 1; },
    activate() { active = true; generation += 1; },
    dispose() { active = false; generation += 1; },
    async refresh(load, publish) {
      if (!active) return false;
      const request = ++generation;
      let snapshot;
      try { snapshot = await load(); }
      catch (error) { if (request === generation) throw error; return false; }
      if (request !== generation || snapshot.state.sequence < sequence) return false;
      sequence = snapshot.state.sequence;
      publish(snapshot);
      return true;
    },
  };
}
