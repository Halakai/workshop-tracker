// Maps a computed movement (src/domain/stock.ts) to the post_stock_movement() arguments.
// Pure: shared by the app and the database integration tests.
import type { Database } from '@/lib/database.types';
import { milliToDb } from '@/domain/quantity';
import type { MovementInput } from '@/domain/stock';

export type PostStockMovementArgs = Database['public']['Functions']['post_stock_movement']['Args'];

export function toPostStockMovementArgs(itemId: string, expectedVersion: number, input: MovementInput): PostStockMovementArgs {
  return {
    p_item_id: itemId,
    p_expected_version: expectedVersion,
    p_type: input.type,
    // numeric: send exact decimal text, never a float
    p_qty_delta: milliToDb(input.delta.qty) as unknown as number,
    p_value_delta_cents: input.delta.value,
    p_occurred_on: input.occurredOn,
    p_supplier: input.supplier?.trim() || undefined,
    p_reason: input.reason?.trim() || undefined,
    p_note: input.note?.trim() || undefined,
    p_paid_by: input.paidBy,
    p_allocations: input.allocations.map((a) => ({ partner_id: a.partnerId, amount_cents: a.amount })),
    p_car_id: input.carId,
  };
}

/** PostgREST error code raised when the item changed between reading it and saving the movement. */
export const STALE_STOCK = 'PT409';
