import { NextResponse } from 'next/server';
import { requireSupplier } from '@/lib/supplier';
import { computeTrustScore } from '@/lib/trust-score';

export async function GET(request: Request) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;

  // Compute with reasonable defaults until we have historical data
  const trust = computeTrustScore({
    responsiveness: 85,
    cancellationRate: 90,
    inventoryFreshness: 80,
    compliance: 95,
  });

  return NextResponse.json({ trustScore: trust.score, components: trust.components });
}
