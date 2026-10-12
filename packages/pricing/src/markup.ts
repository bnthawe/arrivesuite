// Pure route/channel markup math (contract: Hybrid Route Markup).
// commission = round(net * routePct / 10000) + routeFixed, then the
// channel tier modifies it. No I/O — rule loading lives in web/lib.

export type MarkupChannel = 'b2c' | 'b2b' | 'agent' | 'govt';
export type ChannelMode = 'route' | 'route_minus_pct' | 'route_plus_pct' | 'flat';

export interface RouteRule {
  pctBps: number;
  fixedCents: number;
}

export interface ChannelTier {
  mode: ChannelMode;
  pctBps: number;
}

export interface AppliedMarkup {
  commissionCents: number;
  routeRule: RouteRule;
  channel: MarkupChannel;
  channelMode: ChannelMode;
}

const DEFAULT_RULE: RouteRule = { pctBps: 1000, fixedCents: 0 };

export function computeMarkup(
  netCents: number,
  route: RouteRule | null,
  tier: ChannelTier | null,
  channel: MarkupChannel = 'b2c',
): AppliedMarkup {
  const rule = route ?? DEFAULT_RULE;
  const mode = tier?.mode ?? 'route';
  const tierBps = tier?.pctBps ?? 0;

  if (mode === 'flat') {
    return { commissionCents: Math.round((netCents * tierBps) / 10_000), routeRule: rule, channel, channelMode: mode };
  }

  let commission = Math.round((netCents * rule.pctBps) / 10_000) + rule.fixedCents;
  if (mode === 'route_minus_pct') {
    commission = Math.round((commission * (10_000 - tierBps)) / 10_000);
  } else if (mode === 'route_plus_pct') {
    commission += Math.round((netCents * tierBps) / 10_000);
  }
  return { commissionCents: Math.max(0, commission), routeRule: rule, channel, channelMode: mode };
}

export function parseMarkupChannel(value: unknown): MarkupChannel {
  return value === 'b2b' || value === 'agent' || value === 'govt' ? value : 'b2c';
}
