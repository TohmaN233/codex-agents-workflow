#!/bin/sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd) || exit 1
plugin_dir=$(CDPATH= cd "$script_dir/.." && pwd) || exit 1
repo_dir=$(CDPATH= cd "$plugin_dir/../.." && pwd) || exit 1

test ! -d "$plugin_dir/agents" || ! find "$plugin_dir/agents" -type f -print -quit | grep -q . \
  || { printf '%s\n' 'FAIL: fixed Agent files duplicate Workbench Roles' >&2; exit 1; }

if rg -n 'role_ref|role_profile|ROLE <id>|Pinned Role behavior' \
  "$plugin_dir/control-plane/lib" "$plugin_dir/control-plane/web-src"; then
  printf '%s\n' 'FAIL: Workflow runtime still injects Workbench Role behavior' >&2
  exit 1
fi

rg -q 'workflow_role_templates' "$plugin_dir/skills/orchestration/SKILL.md"
rg -q 'workflow_role_template' "$plugin_dir/skills/orchestration/SKILL.md"
rg -q 'longest supported' "$plugin_dir/skills/orchestration/SKILL.md"
rg -q 'Never inject Role instructions into a Workflow node' "$plugin_dir/skills/orchestration/SKILL.md"

node "$plugin_dir/control-plane/test/run-tests.mjs"
git -C "$repo_dir" diff --check
printf '%s\n' 'VERIFY PASSED: Workbench Roles and Workflow execution have one non-overlapping path.'
