import { describe, expect, it } from 'vitest';
import {
  computeCancellation,
  aggregateCancellations,
  type PolicyInput,
} from './cancellation-policy';

function baseInput(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    policy: 'flexible',
    itemType: 'hotel',
    supplierType: 'owned',
    itemTotalCents: 10000,
    netCents: 8000,
    markupCents: 2000,
    serviceStartDate: new Date('2026-12-31T10:00:00Z'),
    cancelledAt: new Date('2026-12-20T10:00:00Z'), // 11 days before
    refundable: true,
    supplierInitiated: false,
    nights: 2,
    ...overrides,
  };
}

describe('cancellation-policy', () => {
  describe('flexible policy', () => {
    it('full refund when cancelled 24h+ before', () => {
      const result = computeCancellation(baseInput({ policy: 'flexible' }));
      expect(result.guestRefundCents).toBe(10000);
      expect(result.feeRetainedCents).toBe(0);
      expect(result.allowed).toBe(true);
    });

    it('no refund when cancelled less than 24h before', () => {
      const result = computeCancellation(
        baseInput({
          policy: 'flexible',
          cancelledAt: new Date('2026-12-31T09:00:00Z'), // 1 hour before
        }),
      );
      expect(result.guestRefundCents).toBe(0);
      expect(result.feeRetainedCents).toBe(10000);
    });
  });

  describe('moderate policy', () => {
    it('full refund when cancelled 5+ days before', () => {
      const result = computeCancellation(baseInput({ policy: 'moderate' }));
      expect(result.guestRefundCents).toBe(10000);
      expect(result.feeRetainedCents).toBe(0);
    });

    it('first-night forfeiture when cancelled less than 5 days before', () => {
      const result = computeCancellation(
        baseInput({
          policy: 'moderate',
          cancelledAt: new Date('2026-12-30T10:00:00Z'), // 1 day before
        }),
      );
      expect(result.guestRefundCents).toBe(5000); // 10000 - 5000 (first night)
      expect(result.feeRetainedCents).toBe(5000);
    });
  });

  describe('strict policy', () => {
    it('full refund when cancelled 14+ days before', () => {
      const result = computeCancellation(
        baseInput({
          policy: 'strict',
          cancelledAt: new Date('2026-12-10T10:00:00Z'), // 21 days before
        }),
      );
      expect(result.guestRefundCents).toBe(10000);
      expect(result.feeRetainedCents).toBe(0);
    });

    it('50% refund when cancelled within 14 days', () => {
      const result = computeCancellation(
        baseInput({
          policy: 'strict',
          cancelledAt: new Date('2026-12-25T10:00:00Z'), // 6 days before
        }),
      );
      expect(result.guestRefundCents).toBe(5000); // 50% of 10000
      expect(result.feeRetainedCents).toBe(5000);
    });

    it('no refund when cancelled after service start', () => {
      const result = computeCancellation(
        baseInput({
          policy: 'strict',
          cancelledAt: new Date('2026-12-31T11:00:00Z'), // 1 hour after
        }),
      );
      expect(result.guestRefundCents).toBe(0);
      expect(result.feeRetainedCents).toBe(10000);
    });
  });

  describe('non_refundable policy', () => {
    it('no refund', () => {
      const result = computeCancellation(baseInput({ policy: 'non_refundable' }));
      expect(result.guestRefundCents).toBe(0);
      expect(result.feeRetainedCents).toBe(10000);
      expect(result.allowed).toBe(true);
    });
  });

  describe('non-refundable item', () => {
    it('no refund for non-refundable flight', () => {
      const result = computeCancellation(
        baseInput({
          itemType: 'flight',
          policy: 'flexible',
          refundable: false,
        }),
      );
      expect(result.guestRefundCents).toBe(0);
      expect(result.feeRetainedCents).toBe(10000);
    });

    it('no refund for non-refundable hotel', () => {
      const result = computeCancellation(
        baseInput({
          itemType: 'hotel',
          policy: 'flexible',
          refundable: false,
        }),
      );
      expect(result.guestRefundCents).toBe(0);
      expect(result.feeRetainedCents).toBe(10000);
    });
  });

  describe('supplier-initiated cancellation', () => {
    it('full refund for owned inventory', () => {
      const result = computeCancellation(
        baseInput({
          supplierType: 'owned',
          supplierInitiated: true,
          policy: 'non_refundable',
          refundable: false,
        }),
      );
      expect(result.guestRefundCents).toBe(10000);
      expect(result.feeRetainedCents).toBe(0);
      expect(result.supplierPayoutAdjustmentCents).toBe(-8000);
      expect(result.commissionOutcomeCents).toBe(-2000);
    });

    it('does not apply to sourced inventory', () => {
      const result = computeCancellation(
        baseInput({
          supplierType: 'sourced',
          supplierInitiated: true,
          policy: 'non_refundable',
          refundable: false,
        }),
      );
      expect(result.guestRefundCents).toBe(0);
    });
  });

  describe('flight cancellations', () => {
    it('uses provider quote when available', () => {
      const result = computeCancellation(
        baseInput({
          itemType: 'flight',
          policy: 'flexible',
          refundable: true,
          providerQuoteRefundCents: 7500,
        }),
      );
      expect(result.guestRefundCents).toBe(7500);
      expect(result.feeRetainedCents).toBe(2500);
    });

    it('full refund when refundable and no provider quote', () => {
      const result = computeCancellation(
        baseInput({
          itemType: 'flight',
          policy: 'flexible',
          refundable: true,
          providerQuoteRefundCents: null,
        }),
      );
      expect(result.guestRefundCents).toBe(10000);
      expect(result.feeRetainedCents).toBe(0);
    });

    it('no refund when non-refundable flight', () => {
      const result = computeCancellation(
        baseInput({
          itemType: 'flight',
          policy: 'flexible',
          refundable: false,
          providerQuoteRefundCents: null,
        }),
      );
      expect(result.guestRefundCents).toBe(0);
      expect(result.feeRetainedCents).toBe(10000);
    });
  });

  describe('three-way split for owned inventory', () => {
    it('adjusts supplier payout on cancellation', () => {
      const result = computeCancellation(
        baseInput({
          supplierType: 'owned',
          policy: 'flexible',
        }),
      );
      expect(result.supplierPayoutAdjustmentCents).toBe(-8000);
    });

    it('no supplier adjustment for sourced inventory', () => {
      const result = computeCancellation(
        baseInput({
          supplierType: 'sourced',
          policy: 'flexible',
        }),
      );
      expect(result.supplierPayoutAdjustmentCents).toBe(0);
    });
  });

  describe('aggregateCancellations', () => {
    it('sums outcomes across multiple items', () => {
      const o1 = computeCancellation(baseInput({ itemTotalCents: 5000 }));
      const o2 = computeCancellation(baseInput({ itemTotalCents: 3000, policy: 'non_refundable', refundable: false }));
      const agg = aggregateCancellations([o1, o2]);
      expect(agg.totalGuestRefundCents).toBe(5000);
      expect(agg.totalFeeRetainedCents).toBe(3000);
      expect(agg.allAllowed).toBe(true);
      expect(agg.messages).toHaveLength(2);
    });

    it('allAllowed is false if any item is not allowed', () => {
      const o1 = computeCancellation(baseInput());
      const o2 = { ...o1, allowed: false };
      const agg = aggregateCancellations([o1, o2]);
      expect(agg.allAllowed).toBe(false);
    });
  });
});