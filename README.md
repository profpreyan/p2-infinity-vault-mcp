# P2 Infinity Vault MCP Server

Quick MCP server that exposes tools to query the public library at:
https://p2infinityvault.vercel.app/library.json

## Tools

- `search_library` — search by name, origin, tags, etc.
- `get_by_id` — full profile by ID (e.g. CH-097)
- `list_characters` — list all characters (optional heritage filter)

## Setup

```bash
npm install
node index.js
```

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "p2-infinity-vault": {
      "command": "node",
      "args": ["/path/to/p2-infinity-vault-mcp/index.js"]
    }
  }
}
```

## Example

Search for Lena (Germanic woman):
- tool: search_library
- query: "Lena" or "Germanic"
- kind: character

Then get full details with get_by_id "CH-097".
