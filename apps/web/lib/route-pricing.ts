import { and, eq, isNull } from 'drizzle-orm';
import { channelMarkupTiers, db, routeMarkupRules } from '@arrivesuite/db';
import {
  computeMarkup,
  parseMarkupChannel,
  type AppliedMarkup,
  type MarkupChannel,
} from '@arrivesuite/pricing';

export interface PricedItem {
  itemType: string;
  itemRef: string;
  quantity?: number;
  netCents: number;
  taxCents?: number;
  origin?: string;
  destination?: string;
}

export interface PricedItemResult extends PricedItem {
  markupCents: number;
  applied: AppliedMarkup;
}

// Applies hybrid route markup to sourced items (flights by O/D, hotels by
// the default rule). Owned items pass through untouched.
export async function applyRouteMarkup(
  items: PricedItem[],
  segment: unknown,
): Promise<PricedItemResult[]> {
  const channel: MarkupChannel = parseMarkupChannel(segment);
  const [tier] = channel === 'b2c'
    ? [{ mode: 'route' as const, pctBps: 0 }]
    : await db.select().from(channelMarkupTiers).where(eq(channelMarkupTiers.channel, channel)).limit(1);

  return Promise.all(
    items.map(async (item) => {
      const [rule] = item.origin && item.destination
        ? await db
            .select()
            .from(routeMarkupRules)
            .where(
              and(
                eq(routeMarkupRules.origin, item.origin.toUpperCase()),
                eq(routeMarkupRules.destination, item.destination.toUpperCase()),
                eq(routeMarkupRules.active, true),
              ),
            )
            .limit(1)
        : await db
            .select()
            .from(routeMarkupRules)
            .where(
              and(
                isNull(routeMarkupRules.origin),
                isNull(routeMarkupRules.destination),
                eq(routeMarkupRules.active, true),
              ),
            )
            .limit(1);
      const applied = computeMarkup(
        item.netCents,
        rule ? { pctBps: rule.pctBps, fixedCents: rule.fixedCents } : null,
        tier ? { mode: tier.mode as AppliedMarkup['channelMode'], pctBps: tier.pctBps } : null,
        channel,
      );
      return { ...item, markupCents: applied.commissionCents, applied };
    }),
  );
}
