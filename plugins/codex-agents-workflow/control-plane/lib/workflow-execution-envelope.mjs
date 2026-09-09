import { isAbsolute, relative, resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { requireValue } from './workflow-paths.mjs';
import { intersectBoundaries, pathBoundaries, resolveBindings } from './workflow-bindings.mjs';
import { digest, canonicalJSON } from './workflow-revisions.mjs';
import { skillPathKey } from './execution/codex-skill-policy.mjs';
import { effectiveSkillPolicy } from './workflow-reference-schema.mjs';
import { nodeWorkspace } from './parallel/workspace.mjs';
import { isThreadExecutor, threadContext } from './thread-handoff.mjs';

export function runPermissions({ workspace, access, allowed_paths = [] }) {
  requireValue(typeof workspace === 'string' && isAbsolute(workspace), 'RUN_WORKSPACE', 'Run workspace must be absolute');
  requireValue(['read_only', 'bounded_write'].includes(access), 'RUN_ACCESS', 'Run access must be explicitly read-only or bounded-write');
  requireValue(Array.isArray(allowed_paths), 'PATH_SCOPE', 'Path scope must be an array');
  const paths = pathBoundaries(allowed_paths.map(value => {
    if (typeof value !== 'string' || !isAbsolute(value.trim())) return value;
    const target = value.trim();
    requireValue(!/[*?\[\]{}!\x00-\x1f]/.test(target), 'PATH_SCOPE', 'Path boundaries cannot contain globs or control characters');
    const path = relative(resolve(workspace), resolve(target));
    requireValue(!isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\'), 'PATH_SCOPE', 'Write target is outside the current Run workspace', {workspace, target});
    return path || '.';
  }));
  requireValue(access !== 'bounded_write' || paths.length, 'RUN_PATHS', 'Write access needs concrete current-Run path boundaries');
  return { workspace, access, allowed_paths: paths };
}

export function nodePermissions(node, state) {
  const access = typeof node.access === 'object' ? state.permissions.access : node.access;
  requireValue(['read_only', 'bounded_write'].includes(access), 'NODE_ACCESS', 'Node has no resolved access mode');
  if (access === 'read_only') return { access, allowed_paths: [] };
  requireValue(state.permissions.access === 'bounded_write', 'NODE_WRITE_UNAUTHORIZED', 'Node requests write access outside this Run authorization');
  const requested = Array.isArray(node.path_scope) ? node.path_scope : state.permissions.allowed_paths;
  const paths = intersectBoundaries(state.permissions.allowed_paths, requested);
  requireValue(paths.length, 'NODE_PATHS_EMPTY', 'Node path scope has no intersection with Run permissions');
  return { access, allowed_paths: paths };
}

export function bindingContext(state) {
  return { inputs: state.inputs, nodes: Object.fromEntries(Object.entries(state.nodes).map(([id, node]) => [id, { output: node.output }])) };
}

export function approvalBinding(node, state, pins, attemptNumber = state.nodes[node.id].attempts.length + 1) {
  const provider = ['provider', 'thread'].includes(node.executor?.kind) ? pins.providers.find(item => item.id === node.executor.provider_id) : node.executor?.kind === 'main' ? pins.generation?.reviewer ?? null : null;
  const permissions = nodePermissions(node, state);
  return {
    required: Boolean(node.approval.required || provider?.requires_user_approval || state.require_approval),
    hash: digest(canonicalJSON({ revision: state.workflow_revision, node_id: node.id, attempt: attemptNumber, provider, permissions, skill_policy: effectiveSkillPolicy(pins.inherited_policy ?? pins.root.workflow.skill_policy, node.skill_policy), subworkflow: node.subworkflow ?? null })),
  };
}

export function leaseToken(controlToken, runId, nodeId, attemptId, generation = 0) {
  return createHmac('sha256', controlToken).update([runId, nodeId, attemptId, ...(generation ? ['generation', String(generation)] : [])].join('\0')).digest('hex');
}

export function executionEnvelope(node, state, pins, attempt, token) {
  const permissions = nodePermissions(node, state);
  const ancestors = new Set(); const queue = [node.id];
  while (queue.length) {
    const target = queue.pop();
    for (const edge of pins.root.workflow.edges.filter(edge => edge.target === target)) if (!ancestors.has(edge.source)) { ancestors.add(edge.source); queue.push(edge.source); }
  }
  const skillPolicy = effectiveSkillPolicy(pins.inherited_policy ?? pins.root.workflow.skill_policy, node.skill_policy);
  const skillPaths = [...skillPolicy.ambient_allow, ...(node.skill_ref ? [node.skill_ref.path, ...node.skill_ref.allowed_nested_skills.map(item => item.path)] : [])];
  const allowedSkills = [...new Set(skillPaths.map(skillPathKey))].map(path => {
    requireValue(!skillPolicy.shadowed_skill_paths.some(shadow => skillPathKey(shadow) === path), 'SKILL_POLICY_CONFLICT', 'Explicit or ambient Skill allowance conflicts with a shadowed source');
    const pin = (pins.skills ?? []).find(skill => skillPathKey(skill.path) === path);
    requireValue(pin, 'SKILL_ALLOW_UNPINNED', 'Node allowance has no immutable Run snapshot'); return structuredClone(pin);
  });
  const thread = isThreadExecutor(node.executor) ? threadContext(state, node.executor) : null;
  return {
    run_id: state.run_id, workflow_id: state.workflow_id, workflow_name: pins.root.workflow.name, workflow_revision: state.workflow_revision,
    node_id: node.id, node_name: node.name ?? node.id, attempt_id: attempt.id, lease_token: token, executor: structuredClone(node.executor),
    provider: ['provider', 'thread'].includes(node.executor.kind) ? structuredClone(pins.providers.find(item => item.id === node.executor.provider_id)) : null,
    role: node.role ?? null, access: permissions.access, workspace: nodeWorkspace(node.id, state, pins),
    inputs: resolveBindings(node.input_bindings ?? {}, bindingContext(state)), workflow_inputs: structuredClone(state.inputs),
    upstream_results: Object.fromEntries([...ancestors].sort().filter(id => ['succeeded', 'failed'].includes(state.nodes[id].status)).map(id => [id, { status: state.nodes[id].status, output: structuredClone(state.nodes[id].output), error: structuredClone(state.nodes[id].error) }])),
    constraints: {...structuredClone(state.constraints),...(state.constraints.task_workspace?{task_workspace:nodeWorkspace(node.id,state,pins)}:{})}, prompt_template: (state.constraints.task_workspace ? `Task working directory: ${nodeWorkspace(node.id,state,pins)}. Use this as the task output base; it is not a boundary for locating or invoking tools or reading task inputs. Determine concrete parameters, intermediate files and output names from the pinned Workflow and task; ask the main controller for genuinely missing task information.\n` : '') + `Declared task dependencies (resolve in the actual execution environment within authorized permissions; report any unresolved dependency with command/error evidence): ${JSON.stringify({executables:pins.root.workflow.requirements?.executables ?? [],environment:pins.root.workflow.requirements?.environment ?? []})}\n` + (skillPolicy.mode === 'cooperative' ? 'Cooperative execution: the workspace and effective_allowed_paths constrain task output writes only. Locate and invoke tools, and read authorized inputs, anywhere permitted by the host. Do not reject an executable or input solely because it is outside the workspace.\n' : '') + `Resolved executable locations for this Run: ${JSON.stringify(state.constraints.runtime_environment?.tools ?? [])}. Use these paths (and a process-local PATH for helpers that spawn them). Before any optional tool-dependent step, discover and verify that tool; if missing, ask for installation consent and recheck before proceeding.\n` + (node.resources?.length ? `Pinned Workflow resources are logical identifiers, not filesystem paths: ${JSON.stringify(node.resources)}. Read them only through read_workflow_resource. Never construct a local path or Markdown file link from a resource identifier; when citing one, name the pinned resource ID.\n` : '') + (node.prompt_template ?? (node.type === 'skill_ref' ? 'Apply the explicitly pinned Skill to {{task}}. Read its references only from the mapped pinned resources.' : '')),
    resources: structuredClone(node.resources ?? []), outputs_schema: structuredClone(node.outputs_schema ?? {}),
    skill_policy: skillPolicy, skill_ref: structuredClone(node.skill_ref ?? null),
    subworkflow: structuredClone(node.subworkflow ?? null),
    thread,
    allowed_skills: allowedSkills,
    effective_allowed_paths: permissions.allowed_paths,
    resource_access: { reader: 'read_workflow_resource', paths: structuredClone(node.resources ?? []) },
    ...(skillPolicy.mode === 'cooperative' ? {path_scope_applies_to:'writes_only',tool_access:'host_permissions',read_access:'host_permissions'} : {}),
  };
}
