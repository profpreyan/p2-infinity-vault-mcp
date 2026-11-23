export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>P2 Infinity Vault MCP</h1>
      <p>MCP endpoint: <code>/api/mcp</code></p>
      <p>Connect with: <code>https://&lt;your-deployment&gt;.vercel.app/api/mcp</code></p>
      <p>Tools: search_library, get_by_id, list_characters</p>
    </main>
  );
}