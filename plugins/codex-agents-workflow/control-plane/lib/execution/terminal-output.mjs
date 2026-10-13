/** Use only the exact already-read or committed state at a Host boundary. */
export function committedTerminalOutput(state){
  return state.status==='succeeded'&&Object.hasOwn(state,'output')
    ?{output:structuredClone(state.output)}:{};
}
