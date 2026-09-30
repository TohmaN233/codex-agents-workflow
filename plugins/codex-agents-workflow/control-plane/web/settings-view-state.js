export function createSettingsViewState() {
  let reloadRequested = false;
  return {
    async canLeave(root, dirty, confirmDiscard, reset = () => {}) {
      if (dirty && !await confirmDiscard()) return false;
      if (dirty) {
        this.discard(root);
        reset();
      }
      else reloadRequested = true;
      return true;
    },
    discard(root) {
      for (const input of root.querySelectorAll('input[type="password"]')) input.value = '';
      reloadRequested = true;
    },
    reloadOnReturn(root, reload) {
      if (!reloadRequested) return false;
      reloadRequested = false;
      reload(root);
      return true;
    },
  };
}
