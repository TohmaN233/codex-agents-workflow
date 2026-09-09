# Parallel execution

Ready read-only nodes may run concurrently. Parallel writes require the backend's
isolated Git worktrees and qualified Strict execution. At a Join, call
`workflow_prepare_integration`, read `workflow_review_integration`, inspect the
complete patch and evidence, then submit the accepted exact hash through
`workflow_integrate_parallel`. Use the supported operations for merging and cleanup.
