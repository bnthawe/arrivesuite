import { and, eq, isNull } from 'drizzle-orm';
import { channelMarkupTiers, db, routeMarkupRules } from '@arrivesuite/db';
import {
  computeMarkup,
  parseMarkupChannel,
  type AppliedMarkup,
  type ChannelMode,
  type ChannelTier,
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

// Fallback if the b2c row is missing from a partially migrated DB. Mirrors
// the 0003_markup.sql seed so pricing stays behaviour-preserving.
const B2C_FALLBACK: ChannelTier = { mode: 'route', pctBps: 0 };

// Applies hybrid route markup to sourced items (flights by O/D, hotels by
// the default rule). Owned items pass through untouched.
export async function applyRouteMarkup(
  items: PricedItem[],
  segment: unknown,
): Promise<PricedItemResult[]> {
  const channel: MarkupChannel = parseMarkupChannel(segment);
  const [tierRow] = await db
    .select()
    .from(channelMarkupTiers)
    .where(eq(channelMarkupTiers.channel, channel))
    .limit(1);

  // Every channel (including b2c) is read from the table so an operator's
  // edit in /admin actually changes pricing. The fallback only covers a
  // database missing the seeded b2c row.
  const tier: ChannelTier | null = tierRow
    ? { mode: tierRow.mode as ChannelMode, pctBps: tierRow.pctBps }
    : channel === 'b2c'
      ? B2C_FALLBACK
      : null;

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
        tier,
        channel,
      );
      return { ...item, markupCents: applied.commissionCents, applied };
    }),
  );
}
