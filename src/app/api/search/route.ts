import { searchTickers } from "@/lib/search";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Ticker autocomplete: GET /api/search?q=appl -> { results: [{ ticker, name, type }] }, US stocks and ETFs, cached per query.
export async function GET(request: Request) {
  const limited = await rateLimit(request, "search");
  if (limited) return limited;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ results: [] });
  if (q.length > 40 || !/^[\w .&'-]+$/.test(q)) return Response.json({ error: "Invalid query" }, { status: 400 });
  try {
    const results = await searchTickers(q);
    return Response.json({ results }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "Search is unavailable" }, { status: 502 });
  }
}
