import { spawn } from 'node:child_process';
import { lstat, readFile, readdir, open, rename, unlink, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep, win32 } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resourcePath, requireValue, noSymlinks, insideRoot, canonicalNoLinks } from '../workflow-paths.mjs';
import { pathBoundaries } from '../workflow-bindings.mjs';
import { digest } from '../workflow-revisions.mjs';

const MAX_FILE = 1024 * 1024;
const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
const within = (root, path) => key(path) === key(root) || key(path).startsWith(key(root) + sep);
const textResult = value => ({ success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(value) }] });
const errorResult = (code, message) => ({ success: false, contentItems: [{ type: 'inputText', text: JSON.stringify({ error: { code, message } }) }] });
const schema = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };
const RECOVERABLE_TOOL_ERRORS = new Set([
  'CODEX_TOOL_ARGUMENTS', 'CODEX_TOOL_PATH', 'INVALID_RESOURCE_PATH', 'CODEX_TOOL_PATH_DENIED',
  'CODEX_TOOL_WRITE_DENIED', 'CODEX_TOOL_DIRECTORY', 'CODEX_TOOL_DIRECTORY_LIMIT', 'CODEX_TOOL_FILE',
  'CODEX_TOOL_ENCODING', 'CODEX_RESOURCE_DENIED', 'CODEX_RESOURCE_RANGE', 'CODEX_RESOURCE_RANGE_LIMIT',
  'CODEX_TOOL_WRITE_ARGUMENTS', 'CODEX_TOOL_WRITE_CONFLICT',
]);
function windowsPathToWsl(path) {
  const match = typeof path === 'string' ? path.match(/^([A-Za-z]):[\\/](.*)$/) : null;
  requireValue(match, 'CODEX_EXECUTION_PATH', 'The inherited WSL execution binding requires Windows drive paths');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}
export function qualifiedExecutionBinding(binding) {
  if (binding === undefined) return null;
  requireValue(binding && binding.kind === 'wsl' && typeof binding.launcher === 'string' && isAbsolute(binding.launcher)
    && basename(binding.launcher).toLowerCase() === 'wsl.exe'
    && win32.dirname(binding.launcher).replaceAll('/', '\\').toLowerCase().endsWith('\\windows\\system32')
    && /^[A-Za-z0-9._-]{1,64}$/.test(binding.distribution)
    && typeof binding.sandbox === 'string' && /^\/(?:[^/\0]+\/)*[^/\0]+$/.test(binding.sandbox)
    && binding.programs && typeof binding.programs === 'object' && !Array.isArray(binding.programs),
  'CODEX_EXECUTION_BINDING', 'The host execution binding is invalid');
  const programs = Object.entries(binding.programs);
  requireValue(programs.length > 0 && programs.length <= 32 && programs.every(([name, path]) => /^[a-z][a-z0-9_-]{0,31}$/.test(name)
    && typeof path === 'string' && /^\/(?:[^/\0]+\/)*[^/\0]+$/.test(path)), 'CODEX_EXECUTION_BINDING', 'The host execution programs are invalid');
  const commandTimeoutMs = binding.command_timeout_ms ?? 300000;
  requireValue(Number.isSafeInteger(commandTimeoutMs) && commandTimeoutMs >= 1000 && commandTimeoutMs <= 600000, 'CODEX_EXECUTION_BINDING', 'The host execution deadline is invalid');
  return { ...structuredClone(binding), command_timeout_ms: commandTimeoutMs };
}
export function executeBoundProgram(binding, { program, args, cwd }, roots, { signal } = {}) {
  requireValue(Object.hasOwn(binding.programs, program) && Array.isArray(args) && args.length <= 256
    && args.every(value => typeof value === 'string' && value.length <= 8192 && !value.includes('\0'))
    && ['workspace', 'task_root'].includes(cwd), 'CODEX_EXECUTION_ARGUMENTS', 'Execution arguments must match the inherited host binding');
  const workspace = windowsPathToWsl(roots.workspace); const taskRoot = windowsPathToWsl(roots.task_root);
  const directory = cwd === 'workspace' ? workspace : taskRoot;
  const path = [...new Set(Object.values(binding.programs).map(value => dirname(value))), '/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin'].join(':');
  const argv = ['-d', binding.distribution, '--', binding.sandbox, '--unshare-net', '--die-with-parent',
    '--ro-bind', '/', '/', '--bind', workspace, workspace, '--tmpfs', '/tmp', '--proc', '/proc', '--dev', '/dev', '--chdir', directory,
    '--setenv', 'HOME', '/tmp', '--setenv', 'TMPDIR', '/tmp', '--setenv', 'TASK_ROOT', taskRoot,
    '--setenv', 'WORKSPACE', workspace, '--setenv', 'PATH', path, '--setenv', 'PYTHONNOUSERSITE', '1', binding.programs[program], ...args];
  return new Promise((resolveResult, reject) => {
    const child = spawn(binding.launcher, argv, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = []; const stderr = []; let bytes = 0; let settled = false; let timer; let abort;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (signal && abort) signal.removeEventListener('abort', abort);
      fn(value);
    };
    const collect = target => chunk => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) { child.kill(); finish(reject, Object.assign(new Error('Bound program output exceeded 1 MiB'), { code: 'CODEX_EXECUTION_OUTPUT' })); return; }
      target.push(chunk);
    };
    child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
    child.once('error', error => finish(reject, Object.assign(error, { code: 'CODEX_EXECUTION_LAUNCH' })));
    child.once('exit', (code, exitSignal) => {
      const stdoutText = Buffer.concat(stdout).toString('utf8'); const stderrText = Buffer.concat(stderr).toString('utf8');
      finish(resolveResult, { exit_code: Number.isInteger(code) ? code : null, signal: exitSignal ?? null, stdout: stdoutText, stderr: stderrText, output: stdoutText + stderrText });
    });
    abort = () => { child.kill(); finish(reject, Object.assign(new Error('Bound program was cancelled'), { code: 'CODEX_EXECUTION_CANCELLED' })); };
    if (signal) signal.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    timer = setTimeout(() => { child.kill(); finish(reject, Object.assign(new Error('Bound program exceeded its host deadline'), { code: 'CODEX_EXECUTION_TIMEOUT' })); }, binding.command_timeout_ms);
  });
}
function safeDiagnostic(error) {
  return String(error?.message ?? 'Workspace tool request was rejected')
    .replace(/\bBearer\s+\S+/ig, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|cookie|secret)\s*[:=]\s*)\S+/ig, '$1[redacted]')
    .slice(0, 1000);
}
function argsShape(args, names) {
  requireValue(args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === names.length && names.every(name => Object.hasOwn(args, name)), 'CODEX_TOOL_ARGUMENTS', 'Tool arguments must match the declared schema');
}

// All file access is performed by this host broker. No shell or arbitrary-path
// dynamic reader is exposed. This is an application boundary, not an OS ACL.
export async function createCodexToolBroker({ workspace, access, allowedPaths = [], deniedPaths = [], resources = [],
  inputRoots = [], executionBinding, authorize, onOperation, recoverToolErrors = false,
}) {
  requireValue(['read_only', 'bounded_write'].includes(access) && typeof authorize === 'function' && typeof onOperation === 'function', 'CODEX_BROKER_AUTHORITY', 'The broker requires explicit access, a live lease check and a durable operation sink');
  await noSymlinks(workspace); const root = await realpath(workspace);
  const boundaries = pathBoundaries(allowedPaths).map(path => join(root, ...path.split('/')));
  requireValue(access !== 'bounded_write' || boundaries.length > 0, 'CODEX_BROKER_SCOPE', 'Write tools require concrete narrowed path boundaries');
  const denied = await Promise.all(deniedPaths.map(path => canonicalNoLinks(path)));
  requireValue(Array.isArray(inputRoots) && inputRoots.length <= 32, 'CODEX_INPUT_ROOTS', 'Input roots must be a bounded array');
  const inputs = new Map();
  for (const item of inputRoots) {
    requireValue(item && /^[a-z][a-z0-9_-]{0,63}$/.test(item.name) && typeof item.path === 'string' && isAbsolute(item.path) && !inputs.has(item.name), 'CODEX_INPUT_ROOTS', 'Each input root needs a unique portable name and absolute path');
    const path = await canonicalNoLinks(item.path);
    requireValue(!denied.some(value => within(value, path)), 'CODEX_INPUT_ROOTS', 'An input root cannot expose executor-owned or denied state');
    inputs.set(item.name, path);
  }
  const execution = qualifiedExecutionBinding(executionBinding);
  if (execution) requireValue(access === 'bounded_write' && inputs.has('task_root'), 'CODEX_EXECUTION_BINDING', 'Inherited task execution requires bounded write access and a task_root input');
  const pinned = new Map();
  requireValue(resources.length <= 512, 'CODEX_RESOURCE_LIMIT', 'Too many node resources');
  let totalResourceBytes = 0;
  for (const item of resources) {
    const path = resourcePath(item.path); const bytes = Buffer.from(item.bytes);
    totalResourceBytes += bytes.length;
    requireValue(bytes.length <= MAX_FILE && totalResourceBytes <= 16 * MAX_FILE && !pinned.has(path) && digest(bytes) === item.sha256, 'CODEX_RESOURCE_PIN', 'Resource is duplicated, oversized or differs from its pin');
    pinned.set(path, { bytes, sha256: item.sha256 });
  }
  function locate(path, write = false, directory = false) {
    requireValue(typeof path === 'string', 'CODEX_TOOL_PATH', 'Tool path must be workspace-relative');
    const parts = directory && path === '.' ? [] : resourcePath(path).split('/');
    requireValue(!parts.some(part => ['.git', '.codex', '.agents', '.skills'].includes(part.toLowerCase()) || part.toLowerCase() === 'skill.md'), 'CODEX_TOOL_PATH_DENIED', 'Runtime configuration, Git internals and ambient Skills are not workspace tool inputs');
    const absolute = parts.length ? insideRoot(root, join(root, ...parts)) : root;
    requireValue(!denied.some(item => within(item, absolute)), 'CODEX_TOOL_PATH_DENIED', 'Path belongs to executor-owned or explicitly denied state');
    if (write) requireValue(access === 'bounded_write' && boundaries.some(item => within(item, absolute)), 'CODEX_TOOL_WRITE_DENIED', 'Write is outside this node permission intersection');
    return absolute;
  }
  function locateInput(name, path, directory = false) {
    requireValue(inputs.has(name) && typeof path === 'string', 'CODEX_INPUT_DENIED', 'Input path is outside the declared read roots');
    const parts = directory && path === '.' ? [] : resourcePath(path).split('/');
    requireValue(!parts.some(part => ['.git', '.codex', '.agents', '.skills'].includes(part.toLowerCase()) || part.toLowerCase() === 'skill.md'), 'CODEX_TOOL_PATH_DENIED', 'Runtime configuration, Git internals and ambient Skills are not task inputs');
    const inputRoot = inputs.get(name); const absolute = parts.length ? insideRoot(inputRoot, join(inputRoot, ...parts)) : inputRoot;
    requireValue(!denied.some(item => within(item, absolute)), 'CODEX_TOOL_PATH_DENIED', 'Input path belongs to executor-owned or explicitly denied state');
    return absolute;
  }
  async function regular(path, { allowMissing = false } = {}) {
    let stat;
    try { await noSymlinks(path); stat = await lstat(path); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (allowMissing) return null;
      requireValue(false, 'CODEX_TOOL_FILE', 'Only bounded regular files without hard links are supported');
    }
    requireValue(stat.isFile() && stat.nlink === 1 && stat.size <= MAX_FILE, 'CODEX_TOOL_FILE', 'Only bounded regular files without hard links are supported');
    return stat;
  }
  async function directory(path) {
    let stat;
    try { await noSymlinks(path); stat = await lstat(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; requireValue(false, 'CODEX_TOOL_DIRECTORY', 'Expected an existing workspace directory'); }
    requireValue(stat.isDirectory(), 'CODEX_TOOL_DIRECTORY', 'Expected an existing workspace directory');
    return stat;
  }
  function decode(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw Object.assign(new Error('File is not valid UTF-8 text'), { code: 'CODEX_TOOL_ENCODING' }); }
  }
  const tools = [
    { name: 'list_workspace', description: 'List one workspace directory, excluding runtime internals and ambient Skills. Use . for its root.', inputSchema: schema({ path: string }) },
    { name: 'read_workspace', description: 'Read a bounded UTF-8 workspace file and its SHA-256 for a later compare-and-swap write.', inputSchema: schema({ path: string }) },
    ...(access === 'bounded_write' ? [{ name: 'write_workspace', description: 'Atomically write UTF-8 text inside the node scope. expected_sha256 must match the current file; null creates a new file. Parent directory must exist.', inputSchema: schema({ path: string, text: string, expected_sha256: { type: ['string', 'null'] } }) }] : []),
    ...(inputs.size ? [
      { name: 'list_input', description: 'List one directory beneath a host-authorized read-only task input root. Use root=task_root and path=. to start.', inputSchema: schema({ root: { type: 'string', enum: [...inputs.keys()] }, path: string }) },
      { name: 'read_input', description: 'Read one bounded UTF-8 file beneath a host-authorized read-only task input root.', inputSchema: schema({ root: { type: 'string', enum: [...inputs.keys()] }, path: string }) },
    ] : []),
    ...(execution ? [{ name: 'run_task_program', description: 'Run one host-bound program in this Run\'s inherited WSL environment. The host owns all platform paths. cwd is a logical root; TASK_ROOT and WORKSPACE are set inside the process. Use write_workspace for text edits, then use this tool for execution and verification.', inputSchema: schema({ program: { type: 'string', enum: Object.keys(execution.programs) }, args: { type: 'array', items: string, maxItems: 256 }, cwd: { type: 'string', enum: ['workspace', 'task_root'] } }) }] : []),
    ...(pinned.size ? [{ name: 'read_workflow_resource', description: 'Read an immutable resource pinned to this node. Prefer read_workflow_resource_range for large references.', inputSchema: schema({ path: { type: 'string', enum: [...pinned.keys()] } }) },
      {name:'read_workflow_resource_range',description:'Read 1–200 numbered lines of an immutable pinned UTF-8 resource. Reports total lines; partial content is not a full-file audit.',inputSchema:schema({path:{type:'string',enum:[...pinned.keys()]},start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1}})}] : []),
  ];
  let queue = Promise.resolve(); let revoked = false;
  async function checkAuthority() {
    requireValue(!revoked, 'CODEX_BROKER_REVOKED', 'Workspace broker was revoked');
    await authorize(); requireValue(!revoked, 'CODEX_BROKER_REVOKED', 'Workspace broker was revoked during authorization');
  }
  async function perform(name, args, callId) {
    requireValue(tools.some(tool => tool.name === name) && typeof callId === 'string' && callId.length <= 256, 'CODEX_TOOL_DENIED', 'Tool is outside this node broker');
    await checkAuthority();
    argsShape(args, name === 'write_workspace' ? ['path', 'text', 'expected_sha256'] : name === 'run_task_program' ? ['program', 'args', 'cwd'] : name==='read_workflow_resource_range'?['path','start_line','end_line']:['list_input','read_input'].includes(name)?['root','path']:['path']);
    if (name === 'run_task_program') {
      const started = Date.now(); await onOperation({ call_id: callId, tool: name, program: args.program, cwd: args.cwd, phase: 'started' });
      const result = await executeBoundProgram(execution, args, { workspace: root, task_root: inputs.get('task_root') });
      await onOperation({ call_id: callId, tool: name, program: args.program, cwd: args.cwd, phase: 'completed', exit_code: result.exit_code, signal: result.signal, duration_ms: Date.now() - started });
      return textResult(result);
    }
    if(name==='read_workflow_resource_range') {
      const item=pinned.get(args.path);requireValue(item,'CODEX_RESOURCE_DENIED','Resource is outside the pinned node manifest');
      const lines=decode(item.bytes).split('\n');
      requireValue(Number.isInteger(args.start_line)&&Number.isInteger(args.end_line)&&args.start_line>=1&&args.start_line<=lines.length&&args.end_line>=args.start_line&&args.end_line-args.start_line<200,'CODEX_RESOURCE_RANGE','Use a valid starting line and at most 200 lines');
      const end=Math.min(args.end_line,lines.length);
      const text=lines.slice(args.start_line-1,end).map((line,index)=>`${args.start_line+index}: ${line}`).join('\n');
      requireValue(Buffer.byteLength(text)<=32768,'CODEX_RESOURCE_RANGE_LIMIT','Selected lines exceed 32 KiB; select a smaller range');
      await onOperation({call_id:callId,tool:name,path:args.path,phase:'read',sha256:item.sha256,start_line:args.start_line,end_line:end,total_lines:lines.length,bytes:Buffer.byteLength(text)});
      return textResult({path:args.path,sha256:item.sha256,start_line:args.start_line,end_line:end,total_lines:lines.length,text});
    }
    if (name === 'read_workflow_resource') {
      const item = pinned.get(args.path); requireValue(item, 'CODEX_RESOURCE_DENIED', 'Resource is outside the pinned node manifest');
      await onOperation({ call_id: callId, tool: name, path: args.path, phase: 'read', sha256: item.sha256 });
      return textResult({ path: args.path, sha256: item.sha256, text: decode(item.bytes) });
    }
    if (name === 'list_input') {
      const path = locateInput(args.root, args.path, true); await directory(path);
      const entries = await readdir(path, { withFileTypes: true });
      requireValue(entries.length <= 2000, 'CODEX_TOOL_DIRECTORY_LIMIT', 'Directory exceeds the qualified entry limit');
      const visible = [];
      for (const entry of entries) {
        if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) continue;
        const child = relative(inputs.get(args.root), join(path, entry.name)).split(sep).join('/');
        try { locateInput(args.root, child); } catch (error) { if (['CODEX_TOOL_PATH_DENIED', 'INVALID_RESOURCE_PATH'].includes(error.code)) continue; throw error; }
        visible.push({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' });
      }
      await onOperation({ call_id: callId, tool: name, root: args.root, path: args.path, phase: 'read', entries: visible.length });
      return textResult({ root: args.root, entries: visible.sort((a, b) => a.name.localeCompare(b.name, 'en')) });
    }
    if (name === 'read_input') {
      const path = locateInput(args.root, args.path); await regular(path); const bytes = await readFile(path);
      requireValue(bytes.length <= MAX_FILE, 'CODEX_TOOL_FILE', 'File grew beyond the read limit');
      const text = decode(bytes); const sha256 = digest(bytes);
      await onOperation({ call_id: callId, tool: name, root: args.root, path: args.path, phase: 'read', sha256 });
      return textResult({ root: args.root, path: args.path, sha256, text });
    }
    const path = locate(args.path, name === 'write_workspace', name === 'list_workspace');
    if (name === 'list_workspace') {
      await directory(path);
      const entries = await readdir(path, { withFileTypes: true });
      requireValue(entries.length <= 2000, 'CODEX_TOOL_DIRECTORY_LIMIT', 'Directory exceeds the qualified entry limit');
      const visible = [];
      for (const entry of entries) {
        if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) continue;
        const child = relative(root, join(path, entry.name)).split(sep).join('/');
        try { locate(child); } catch (error) { if (['CODEX_TOOL_PATH_DENIED', 'INVALID_RESOURCE_PATH'].includes(error.code)) continue; throw error; }
        visible.push({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' });
      }
      await onOperation({ call_id: callId, tool: name, path: args.path, phase: 'read', entries: visible.length });
      return textResult({ entries: visible.sort((a, b) => a.name.localeCompare(b.name, 'en')) });
    }
    if (name === 'read_workspace') {
      await regular(path); const bytes = await readFile(path);
      requireValue(bytes.length <= MAX_FILE, 'CODEX_TOOL_FILE', 'File grew beyond the read limit');
      const text = decode(bytes); const sha256 = digest(bytes);
      await onOperation({ call_id: callId, tool: name, path: args.path, phase: 'read', sha256 });
      return textResult({ path: args.path, sha256, text });
    }
    requireValue(typeof args.text === 'string' && Buffer.byteLength(args.text) <= MAX_FILE && (args.expected_sha256 === null || /^[a-f0-9]{64}$/.test(args.expected_sha256)), 'CODEX_TOOL_WRITE_ARGUMENTS', 'Write needs bounded text and an exact prior content hash or null');
    const parent = dirname(path); await noSymlinks(parent);
    const prior = await regular(path, { allowMissing: true });
    const previous = prior ? digest(await readFile(path)) : null;
    requireValue(previous === args.expected_sha256, 'CODEX_TOOL_WRITE_CONFLICT', 'Workspace file changed since the caller observed it');
    const sha256 = digest(args.text); const operation = { call_id: callId, tool: name, path: args.path, before_sha256: previous, after_sha256: sha256 };
    await onOperation({ ...operation, phase: 'intent' }); await checkAuthority();
    const temporary = join(parent, '.sol-write-' + randomUUID()); let committed = false;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(args.text); await handle.sync(); } finally { await handle.close(); }
      await noSymlinks(parent);
      // Revalidate after the asynchronous durable intent. This serializes our
      // writer; concurrent external editors still need the worktree gate.
      const observed = await regular(path, { allowMissing: true });
      const current = observed ? digest(await readFile(path)) : null;
      requireValue(current === previous, 'CODEX_TOOL_WRITE_CONFLICT', 'Workspace changed while preparing the write');
      await checkAuthority(); await rename(temporary, path); committed = true;
      await onOperation({ ...operation, phase: 'committed' });
      return textResult({ path: args.path, sha256 });
    } catch (error) {
      if (!committed) try { await unlink(temporary); } catch (cleanup) { if (cleanup.code !== 'ENOENT') throw new AggregateError([error, cleanup], 'Workspace write and temporary cleanup failed'); }
      if (committed) { error.committed = true; error.operation = operation; }
      throw error;
    }
  }
  return { tools: () => structuredClone(tools), revoke() { revoked = true; },
    async quiesce() {
      revoked = true;
      // Preserve the failure as an explicit shutdown outcome. The tool caller
      // also receives its original rejection; this only waits for it to settle.
      return queue.then(() => ({ quiescent: true, error: null }), error => ({ quiescent: true, error }));
    },
    call(name, args, callId) {
    const next = queue.then(async () => {
      try { return await perform(name, args, callId); }
      catch (error) {
        if (!recoverToolErrors || error?.committed || !RECOVERABLE_TOOL_ERRORS.has(error?.code)) throw error;
        const diagnostic = safeDiagnostic(error);
        const path = typeof args?.path === 'string' ? args.path.slice(0, 1000) : '';
        await onOperation({ call_id: callId, tool: name, ...(typeof args?.root === 'string' ? { root: args.root.slice(0, 1000) } : {}), path, phase: 'rejected', code: error.code, diagnostic });
        return errorResult(error.code, diagnostic);
      }
    });
    // A failed operation poisons this broker. No subsequent tool may hide it.
    queue = next; return next;
  } };
}
