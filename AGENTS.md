# Activity Feed — agent notes

**Phone / production dashboard is on OVH, not this Mac.**
After changing `dashboard/`, deploy with `cd dashboard && npm run deploy:ovh`.
Details: [`dashboard/AGENTS.md`](dashboard/AGENTS.md) and
[`openwiki/deployment/ovh-production.md`](openwiki/deployment/ovh-production.md).

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
