/**
 * Generates a random-but-plausible JSON payload for each ping.
 *
 * The assignment only asks for "random JSON payload data", so we lean into the
 * BizScout domain: each payload looks like a synthetic marketplace event with
 * randomized shape (varying keys, nesting, and array lengths) so stored
 * payloads aren't uniform.
 */

const EVENT_TYPES = ['listing.viewed', 'listing.created', 'offer.made', 'deal.closed', 'search'];
const CATEGORIES = ['laundromat', 'car-wash', 'vending', 'landscaping', 'hvac', 'e-commerce'];
const REGIONS = ['austin-tx', 'boise-id', 'tampa-fl', 'columbus-oh', 'reno-nv'];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface PingPayload {
  event: string;
  ts: string;
  requestId: string;
  actor: { id: string; sessionDepth: number };
  listing?: { category: string; region: string; askingPriceUsd: number; cashflowUsd: number };
  tags?: string[];
}

export function generatePayload(): PingPayload {
  const payload: PingPayload = {
    event: pick(EVENT_TYPES),
    ts: new Date().toISOString(),
    requestId: crypto.randomUUID(),
    actor: { id: `user_${randomInt(1000, 9999)}`, sessionDepth: randomInt(1, 30) },
  };
  // Randomize the shape, not just the values.
  if (Math.random() > 0.3) {
    payload.listing = {
      category: pick(CATEGORIES),
      region: pick(REGIONS),
      askingPriceUsd: randomInt(50, 2000) * 1000,
      cashflowUsd: randomInt(30, 500) * 1000,
    };
  }
  if (Math.random() > 0.5) {
    payload.tags = Array.from({ length: randomInt(1, 4) }, () => pick(CATEGORIES));
  }
  return payload;
}
