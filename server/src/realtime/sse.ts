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
    res.write(': connected\n\n');
    this.clients.add(res);
    this.logger?.debug({ clients: this.clients.size }, 'sse client connected');

    // Keep intermediary proxies from closing idle connections.
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => this.ping(), 30_000);
      this.heartbeat.unref();
    }

    res.on('close', () => {
      this.clients.delete(res);
      this.logger?.debug({ clients: this.clients.size }, 'sse client disconnected');
    });
  }

  broadcast(event: string, data: unknown): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.write(frame);
    }
  }

  private ping(): void {
    for (const client of this.clients) {
      client.write(': heartbeat\n\n');
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
