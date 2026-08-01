import { streamNomadEvents, type NomadEvent } from "@/lib/nomad";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { signal } = request;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send an initial heartbeat so the SSE connection opens
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      await streamNomadEvents(
        (event: NomadEvent) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            // Connection closed
          }
        },
        signal,
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
