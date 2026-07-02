import type { Response } from 'express';
import type { Logger } from '../logger.js';

/**
 * Minimal Server-Sent Events hub.
 *
 * SSE was chosen over WebSockets deliberately: the data flow is strictly
 * server → client broadcast, EventSource reconnects automatically, and the
 * same primitive is reused for streaming chat responses.
 */
export class SseHub {
  private clients = new Set<Response>();
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(private logger?: Logger) {}

  addClient(res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    this.clients.add(res);

    // Keep intermediary proxies from closing idle connections.
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => this.ping(), 30_000);
      this.heartbeat.unref();
    }

    const remove = () => {
      if (this.clients.delete(res)) {
        this.logger?.debug({ clients: this.clients.size }, 'sse client disconnected');
      }
    };
    res.on('close', remove);
    // An unclean client disconnect (ECONNRESET/EPIPE) emits an 'error' on the
    // response stream. Without this listener that becomes an unhandled 'error'
    // event and crashes the whole process — so always handle it.
    res.on('error', remove);

    try {
      res.write(': connected\n\n');
      this.logger?.debug({ clients: this.clients.size }, 'sse client connected');
    } catch (err) {
      this.logger?.debug({ err }, 'sse client failed on connect');
      remove();
    }
  }

  broadcast(event: string, data: unknown): void {
    this.writeAll(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private ping(): void {
    this.writeAll(': heartbeat\n\n');
  }

  /** Writes to every client, dropping any that fail rather than throwing. */
  private writeAll(frame: string): void {
    for (const client of this.clients) {
      try {
        client.write(frame);
      } catch (err) {
        // Client vanished between its disconnect event and this write.
        this.clients.delete(client);
        this.logger?.debug({ err }, 'dropped unwritable sse client');
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}
