import { informationalImportObservation } from '../workflow-import-observations.mjs';
import { posix } from 'node:path';
import { readDependencyMetadata } from './metadata-reader.mjs';

// Deliberately finite static observations. This never runs a script or claims
// to infer its behavior. Unresolved observations remain visible Draft blockers.
export function analyzeSkillDependencies(snapshot) {
  const unresolved = snapshot.problems.map(item => ({ ...item, origin: 'observed' }));
  const references = []; const requirements = { providers: [], tools: ['read_workflow_resource'], mcp_servers: [], executables: [], environment: [] };
  const declared = readDependencyMetadata(snapshot); unresolved.push(...declared.unresolved);
  for (const [kind, names] of Object.entries(declared.requirements)) requirements[kind].push(...names);
  for (const [path, bytes] of Object.entries(snapshot.files)) {
    if (/\/scripts\/|\.(?:py|mjs|cjs|js|sh|ps1|cmd|bat)$/i.test(path)) {
      unresolved.push({ code: 'SCRIPT_REQUIRES_REVIEW', path, origin: 'observed' });
      const executable = /\.py$/i.test(path) ? 'python' : /\.[mc]?js$/i.test(path) ? 'node' : /\.ps1$/i.test(path) ? 'powershell' : null;
      if (executable) requirements.executables.push(executable);
    }
    if (snapshot.inventory.some(item => 'source/' + item.path === path && item.binary)) {
      unresolved.push({ code: 'BINARY_RESOURCE_REQUIRES_CAPABILITY', path, origin: 'observed' }); continue;
    }
    const text = bytes.toString('utf8');
    // Shell substitutions can be local variables (for example ANSI colors), and
    // JavaScript template interpolation is not an environment read at all.
    for (const match of text.matchAll(/\b(?:process\.env\.([A-Z_][A-Z0-9_]*)|os\.environ\[["']([A-Z_][A-Z0-9_]*)["']\])/g)) requirements.environment.push(match[1] ?? match[2]);
    if (/\.sh$/i.test(path)) {
      const locals = new Set([...text.matchAll(/(?:^|[;\n])\s*(?:export\s+|local\s+)?([A-Z_][A-Z0-9_]*)\s*=(["'])([^$`\n]*?)\2(?=\s|;|$)/g)].map(m => m[1]));
      for (const match of text.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g)) if (!locals.has(match[1])) requirements.environment.push(match[1]);
    }
    if (/\b[A-Za-z]:[\\/]|(?:^|[\s"'(])\/(?:Users|home)\//m.test(text) || text.includes(snapshot.root)) unresolved.push({ code: 'SOURCE_LINKED_PATH', path, origin: 'observed' });
    if (/(?:^|[\s"'(])\/(?:usr|opt|etc)\//m.test(text)) unresolved.push({code:'RUNTIME_PATH_REFERENCE',path,origin:'observed'});
    for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '').split(/\s+["']/)[0];
      const line = text.slice(0, match.index).split('\n').length;
      if (target.startsWith('#')) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
        references.push({ path, target, line, kind: 'external' });
        unresolved.push({ code: 'EXTERNAL_REFERENCE_REQUIRES_REVIEW', path, line, target, origin: 'observed' }); continue;
      }
      let local;
      try { local = decodeURIComponent(target.split('#')[0]); } catch { unresolved.push({ code: 'INVALID_REFERENCE', path, line, origin: 'observed' }); continue; }
      if (local.startsWith('/') || local.includes('\\')) { unresolved.push({ code: 'SOURCE_LINKED_PATH', path, line, target: local, origin: 'observed' }); continue; }
      const resolved = posix.normalize(posix.join(posix.dirname(path), local));
      const contained = resolved.startsWith('source/') && Object.hasOwn(snapshot.files, resolved);
      references.push({ path, target: local, resolved, line, kind: 'local', present: contained });
      if (!contained) unresolved.push({ code: 'UNRESOLVED_LOCAL_REFERENCE', path, line, target: local, origin: 'observed' });
    }
  }
  for (const kind of Object.keys(requirements)) requirements[kind] = [...new Set(requirements[kind])].sort();
  return { requirements, references, declarations: declared.declarations, observations:unresolved.filter(informationalImportObservation), unresolved:unresolved.filter(i=>!informationalImportObservation(i)), classification: unresolved.some(item => item.code === 'SOURCE_LINKED_PATH') ? 'source_linked' : unresolved.length || requirements.executables.length || requirements.environment.length || requirements.mcp_servers.length || requirements.tools.some(tool => tool !== 'read_workflow_resource') ? 'external_requirements' : 'self_contained_candidate' };
}
