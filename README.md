# P2 Infinity Vault MCP (HTTP)

Remote MCP server for the P2 Infinity Vault library.

## Endpoint

After deploy: `https://p2-infinity-vault-mcp.vercel.app/api/mcp`  
(or whatever Vercel assigns)

## Tools

- `search_library` — search by name, origin, tags
- `get_by_id` — full record (e.g. CH-097)
- `list_characters` — list with optional heritage filter

## Connect

**Claude / Grok / Cursor (Streamable HTTP):**
```json
{
  "url": "https://YOUR-DEPLOYMENT.vercel.app/api/mcp"
}
```

**stdio clients (via mcp-remote):**
```json
{
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://YOUR-DEPLOYMENT.vercel.app/api/mcp"]
}
```
