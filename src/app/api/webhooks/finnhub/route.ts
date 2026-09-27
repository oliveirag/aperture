import { receiveFinnhubWebhook } from "@/lib/webhooks/receive";
import { createDurableDeliveryStore } from "@/lib/webhooks/store";

export const runtime = "nodejs";
export const maxDuration = 60;

// No ACK-then-after(): only a completed durable receipt returns 2xx. The SQL
// migration must be deployed separately; unavailable/missing storage returns
// retryable 503. Memory stores are explicit test helpers, never a route fallback.
export async function POST(request: Request) {
  return receiveFinnhubWebhook(request, {
    secret: process.env.FINNHUB_WEBHOOK_SECRET,
    store: createDurableDeliveryStore(),
  });
}
