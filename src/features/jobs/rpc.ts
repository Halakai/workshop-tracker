// Maps computed stock deltas (src/domain/stock.ts) to the job line functions' arguments.
// Pure: shared by the app and the database integration tests.
import { milliToDb } from '@/domain/quantity';
import type { StockDelta } from '@/domain/stock';
import type { Cents } from '@/domain/money';

export function toAddJobStockLineArgs(args: {
  jobId: string;
  itemId: string;
  expectedVersion: number;
  delta: StockDelta;
  salePrice: Cents;
  description: string;
  occurredOn: string;
}) {
  return {
    p_job_id: args.jobId,
    p_item_id: args.itemId,
    p_expected_version: args.expectedVersion,
    // numeric: send exact decimal text, never a float
    p_qty_delta: milliToDb(args.delta.qty) as unknown as number,
    p_value_delta_cents: args.delta.value,
    p_sale_price_cents: args.salePrice,
    p_description: args.description,
    p_occurred_on: args.occurredOn,
  };
}

export function toRemoveJobStockLineArgs(lineId: string, expectedVersion: number, returned: StockDelta) {
  return { p_line_id: lineId, p_expected_version: expectedVersion, p_value_delta_cents: returned.value };
}
