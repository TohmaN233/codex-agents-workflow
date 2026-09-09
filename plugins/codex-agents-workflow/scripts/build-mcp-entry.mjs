import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(resolve(root,'scripts/mcp-bootstrap.cjs'),'utf8');
const manifestPath=resolve(root,'.mcp.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const spec=manifest.mcpServers['codex-agents-workflow'];
// From an installed revision this is the cache root, outside disposable versions.
spec.cwd='../../..';
spec.args=['-e',source+"\nboot().catch(error=>{console.error('WORKFLOW_MCP_BOOT_FAILED',error.stack||error);process.exitCode=1;});"];
spec.env_vars=[...new Set([...spec.env_vars,'CODEX_CLI_PATH'])];
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
