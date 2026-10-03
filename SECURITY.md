# Security policy

Report suspected vulnerabilities privately through [GitHub's vulnerability reporting form](https://github.com/TohmaN233/codex-agents-workflow/security/advisories/new). Do not open a public issue with credentials, private source, or an exploit against another user's workspace.

Include the affected version and platform, reproduction steps, the expected permission boundary, and sanitized startup or Run diagnostics. Remove provider credentials, console tokens, task capabilities, and personal file contents.

Security fixes target the current release. Older versions should be upgraded before reproducing a report. This project does not promise a fixed response time.

## Boundaries

The local Host executes Workflows under their declared access and workspace scopes. Main retains verification and acceptance. Third-party Providers and connectors require configuration and can send the selected task material to those services; their account and service permissions also apply.

Plugins and imported Workflows contain executable code or instructions. Review their source before installing or granting write access. Store credentials in private per-user state or environment variables, never in exported packages.
