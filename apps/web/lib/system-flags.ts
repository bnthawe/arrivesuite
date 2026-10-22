import { eq } from 'drizzle-orm';
import { db, systemFlags } from '@arrivesuite/db';

export const SYSTEM_FLAG_KEYS = ['bookings_enabled', 'payments_enabled'] as const;
export type SystemFlagKey = (typeof SYSTEM_FLAG_KEYS)[number];

export interface SystemFlagView {
  key: SystemFlagKey;
  enabled: boolean;
  note: string | null;
  updatedAt: Date | null;
}

// Missing rows default to enabled. The migration seeds the two known flags,
// but this keeps a fresh or partially migrated database usable.
export async function getSystemFlag(key: SystemFlagKey): Promise<boolean> {
  const [row] = await db
    .select({ enabled: systemFlags.enabled })
    .from(systemFlags)
    .where(eq(systemFlags.key, key))
    .limit(1);
  return row?.enabled ?? true;
}

export async function listSystemFlags(): Promise<SystemFlagView[]> {
  const rows = await db.select().from(systemFlags);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return SYSTEM_FLAG_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      enabled: row?.enabled ?? true,
      note: row?.note ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function setSystemFlag(
  key: SystemFlagKey,
  enabled: boolean,
  actorId: string,
  note: string | null = null,
): Promise<SystemFlagView> {
  const now = new Date();
  const [row] = await db
    .insert(systemFlags)
    .values({ key, enabled, note, updatedBy: actorId, updatedAt: now })
    .onConflictDoUpdate({
      target: systemFlags.key,
      set: { enabled, note, updatedBy: actorId, updatedAt: now },
    })
    .returning();
  return {
    key: row.key as SystemFlagKey,
    enabled: row.enabled,
    note: row.note,
    updatedAt: row.updatedAt,
  };
}
