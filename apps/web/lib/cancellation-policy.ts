// §5.20 Cancellation & Refund Policy Engine
//
// Pure, deterministic, testable computation of cancellation outcomes.
// Given a booking item, a cancellation timestamp, and the applicable policy,
// returns the guest refund, fee retained, supplier-payout adjustment, and
// commission outcome. No DB or provider calls.

export type CancellationPolicy = 'flexible' | 'moderate' | 'strict' | 'non_refundable';

export type ItemSupplierType = 'owned' | 'sourced' | 'consolidated';

export type ItemType = 'flight' | 'hotel' | 'tour' | 'activity' | 'transfer';

export interface PolicyInput {
  /** The policy name from the rate plan or fare rules. */
  policy: CancellationPolicy;
  /** Item type determines whether flight fare rules or hotel policy applies. */
  itemType: ItemType;
  /** Supplier type determines payout/commission split. */
  supplierType: ItemSupplierType;
  /** Total amount paid for this item (cents). */
  itemTotalCents: number;
  /** Net amount payable to supplier (cents) — sourced items only. */
  netCents: number;
  /** Markup/commission (cents). */
  markupCents: number;
  /** Service start date (check-in, departure, tour date). */
  serviceStartDate: Date;
  /** When the cancellation is requested. */
  cancelledAt: Date;
  /** Whether the fare/item is refundable at all (flight fare flag or rate plan flag). */
  refundable: boolean;
  /** Whether this is a supplier-initiated cancellation (owned inventory). */
  supplierInitiated: boolean;
  /** Number of nights (hotel) for first-night forfeiture. */
  nights?: number;
  /** Provider quote refund amount (cents) — authoritative for flights when present. */
  providerQuoteRefundCents?: number | null;
}

export interface CancellationOutcome {
  /** Amount refunded to the guest (cents). */
  guestRefundCents: number;
  /** Fee retained by the platform (cents). */
  feeRetainedCents: number;
  /** Adjustment to supplier payout (cents). Negative = clawback. */
  supplierPayoutAdjustmentCents: number;
  /** Commission outcome (cents). 0 = no change, negative = forfeited. */
  commissionOutcomeCents: number;
  /** Guest-visible message. */
  guestMessage: string;
  /** Whether the cancellation is allowed. */
  allowed: boolean;
  /** Reason if not allowed. */
  reason?: string;
}

// Policy definitions: hours before service start for full refund, etc.
interface PolicyRule {
  /** Hours before service start for full refund. null = never. */
  fullRefundHours: number | null;
  /** Refund percentage (0-100) outside the full-refund window but within the partial window. */
  partialRefundPct: number;
  /** Hours before service start for partial refund. null = no partial. */
  partialRefundHours: number | null;
  /** First-night forfeiture (hotel moderate policy). */
  firstNightForfeiture: boolean;
}

const POLICY_RULES: Record<CancellationPolicy, PolicyRule> = {
  flexible: {
    fullRefundHours: 24,
    partialRefundPct: 0,
    partialRefundHours: null,
    firstNightForfeiture: false,
  },
  moderate: {
    fullRefundHours: 5 * 24, // 5 days
    partialRefundPct: 0, // first night forfeiture handled separately
    partialRefundHours: null,
    firstNightForfeiture: true,
  },
  strict: {
    fullRefundHours: 14 * 24, // 14 days
    partialRefundPct: 50,
    partialRefundHours: 14 * 24, // 50% to 14 days before
    firstNightForfeiture: false,
  },
  non_refundable: {
    fullRefundHours: null,
    partialRefundPct: 0,
    partialRefundHours: null,
    firstNightForfeiture: false,
  },
};

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

/**
 * Compute the cancellation outcome for a single item.
 *
 * Deterministic: same inputs always produce the same output.
 */
export function computeCancellation(input: PolicyInput): CancellationOutcome {
  const {
    policy,
    itemType,
    supplierType,
    itemTotalCents,
    netCents,
    markupCents,
    serviceStartDate,
    cancelledAt,
    refundable,
    supplierInitiated,
    nights = 1,
    providerQuoteRefundCents,
  } = input;

  // Non-refundable items: no guest refund (unless supplier-initiated on owned inventory)
  if (!refundable && !supplierInitiated) {
    // Flight fare rules: non-refundable sourced fare refunds nothing
    if (itemType === 'flight') {
      return {
        guestRefundCents: 0,
        feeRetainedCents: itemTotalCents,
        supplierPayoutAdjustmentCents: 0, // sourced: no payout adjustment (fee to airline)
        commissionOutcomeCents: markupCents, // commission retained
        guestMessage: 'This fare is non-refundable. No refund will be issued.',
        allowed: true,
      };
    }
    // Hotel/tour/etc non-refundable
    return {
      guestRefundCents: 0,
      feeRetainedCents: itemTotalCents,
      supplierPayoutAdjustmentCents: supplierType === 'owned' ? -netCents : 0,
      commissionOutcomeCents: markupCents,
      guestMessage: 'This booking is non-refundable. No refund will be issued.',
      allowed: true,
    };
  }

  // Supplier-initiated cancellation on owned inventory: full refund regardless of policy
  if (supplierInitiated && supplierType === 'owned') {
    return {
      guestRefundCents: itemTotalCents,
      feeRetainedCents: 0,
      supplierPayoutAdjustmentCents: -netCents,
      commissionOutcomeCents: -markupCents, // commission forfeited
      guestMessage: 'Your booking has been cancelled by the supplier. A full refund will be issued.',
      allowed: true,
    };
  }

  // Flight cancellations: use provider quote if available, otherwise fare rules
  if (itemType === 'flight') {
    if (providerQuoteRefundCents != null) {
      const refund = Math.max(0, Math.min(providerQuoteRefundCents, itemTotalCents));
      return {
        guestRefundCents: refund,
        feeRetainedCents: itemTotalCents - refund,
        supplierPayoutAdjustmentCents: 0, // sourced: airline handles
        commissionOutcomeCents: refund > 0 ? 0 : markupCents, // commission forfeited if no refund
        guestMessage:
          refund > 0
            ? `A refund of ${refund} cents will be processed.`
            : 'This fare is non-refundable. No refund will be issued.',
        allowed: true,
      };
    }
    // No provider quote: use refundable flag
    if (refundable) {
      return {
        guestRefundCents: itemTotalCents,
        feeRetainedCents: 0,
        supplierPayoutAdjustmentCents: 0,
        commissionOutcomeCents: 0,
        guestMessage: 'A full refund will be processed.',
        allowed: true,
      };
    }
    return {
      guestRefundCents: 0,
      feeRetainedCents: itemTotalCents,
      supplierPayoutAdjustmentCents: 0,
      commissionOutcomeCents: markupCents,
      guestMessage: 'This fare is non-refundable. No refund will be issued.',
      allowed: true,
    };
  }

  // Hotel/tour/activity/transfer: use policy library
  const rule = POLICY_RULES[policy];
  const hoursBeforeService = hoursBetween(cancelledAt, serviceStartDate);

  // Flexible: full refund if cancelled 24h+ before
  if (policy === 'flexible') {
    if (rule.fullRefundHours !== null && hoursBeforeService >= rule.fullRefundHours) {
      return fullRefund(input);
    }
    // Less than 24h: no refund
    return noRefund(input, 'Cancellation less than 24 hours before check-in. No refund.');
  }

  // Moderate: full refund if 5+ days before, first-night forfeiture otherwise
  if (policy === 'moderate') {
    if (rule.fullRefundHours !== null && hoursBeforeService >= rule.fullRefundHours) {
      return fullRefund(input);
    }
    // First-night forfeiture
    const nightlyRate = nights > 0 ? Math.round(itemTotalCents / nights) : itemTotalCents;
    const firstNight = Math.min(nightlyRate, itemTotalCents);
    const refund = Math.max(0, itemTotalCents - firstNight);
    return {
      guestRefundCents: refund,
      feeRetainedCents: firstNight,
      supplierPayoutAdjustmentCents: supplierType === 'owned' ? -netCents : 0,
      commissionOutcomeCents: 0,
      guestMessage:
        refund > 0
          ? `First night forfeited. A refund of ${refund} cents will be processed.`
          : 'First night forfeited. No further refund.',
      allowed: true,
    };
  }

  // Strict: 50% refund to 14 days before, nothing after
  if (policy === 'strict') {
    if (rule.fullRefundHours !== null && hoursBeforeService >= rule.fullRefundHours) {
      return fullRefund(input);
    }
    if (rule.partialRefundHours !== null && hoursBeforeService >= 0) {
      // Partial refund (50%) if within the partial window
      if (hoursBeforeService < rule.partialRefundHours) {
        const refund = Math.round(itemTotalCents * (rule.partialRefundPct / 100));
        return {
          guestRefundCents: refund,
          feeRetainedCents: itemTotalCents - refund,
          supplierPayoutAdjustmentCents: supplierType === 'owned' ? -netCents : 0,
          commissionOutcomeCents: 0,
          guestMessage: `${rule.partialRefundPct}% refund. A refund of ${refund} cents will be processed.`,
          allowed: true,
        };
      }
    }
    return noRefund(input, 'Cancellation less than 14 days before. No refund.');
  }

  // Non-refundable
  return noRefund(input, 'This booking is non-refundable. No refund will be issued.');
}

function fullRefund(input: PolicyInput): CancellationOutcome {
  return {
    guestRefundCents: input.itemTotalCents,
    feeRetainedCents: 0,
    supplierPayoutAdjustmentCents: input.supplierType === 'owned' ? -input.netCents : 0,
    commissionOutcomeCents: 0,
    guestMessage: 'A full refund will be processed.',
    allowed: true,
  };
}

function noRefund(input: PolicyInput, message: string): CancellationOutcome {
  return {
    guestRefundCents: 0,
    feeRetainedCents: input.itemTotalCents,
    supplierPayoutAdjustmentCents: input.supplierType === 'owned' ? -input.netCents : 0,
    commissionOutcomeCents: input.markupCents,
    guestMessage: message,
    allowed: true,
  };
}

/**
 * Aggregate cancellation outcomes across multiple items.
 * Sums guest refunds, fees, supplier adjustments, and commission outcomes.
 */
export function aggregateCancellations(outcomes: CancellationOutcome[]): {
  totalGuestRefundCents: number;
  totalFeeRetainedCents: number;
  totalSupplierPayoutAdjustmentCents: number;
  totalCommissionOutcomeCents: number;
  allAllowed: boolean;
  messages: string[];
} {
  return {
    totalGuestRefundCents: outcomes.reduce((s, o) => s + o.guestRefundCents, 0),
    totalFeeRetainedCents: outcomes.reduce((s, o) => s + o.feeRetainedCents, 0),
    totalSupplierPayoutAdjustmentCents: outcomes.reduce((s, o) => s + o.supplierPayoutAdjustmentCents, 0),
    totalCommissionOutcomeCents: outcomes.reduce((s, o) => s + o.commissionOutcomeCents, 0),
    allAllowed: outcomes.every((o) => o.allowed),
    messages: outcomes.map((o) => o.guestMessage),
  };
}