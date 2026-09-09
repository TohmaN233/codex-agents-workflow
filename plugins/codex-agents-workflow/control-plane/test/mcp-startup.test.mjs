import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,toNamespacedPath} from 'node:path';
import {probe} from '../../scripts/check-mcp-startup.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
test('packaged MCP initializes and exposes execution tools from ordinary and Windows extended paths',async()=>{
 for(const cwd of [...new Set([root,toNamespacedPath(root)])])assert.equal((await probe(root,{cwd})).status,'ready');
});
