// Maps a computed settlement (src/domain/settlement.ts) to the record_settlement() arguments.
// Pure: shared by the app and the database integration tests.
import type { Json } from '@/lib/database.types';
import type { SettlementInput, SettlementResult } from '@/domain/settlement';

export type SettleTarget = { carId: string; jobId?: undefined } | { jobId: string; carId?: undefined };

export function toRecordSettlementArgs(
  target: SettleTarget,
  input: SettlementInput,
  result: SettlementResult,
  settledOn: string,
  includedTransfers: boolean[] = result.transfers.map(() => true),
) {
  const obj = (m: Map<string, number>) => Object.fromEntries(m) as Json;
  return {
    p_car_id: target.carId,
    p_job_id: target.jobId,
    p_payout_mode: input.mode,
    p_reimburse: input.reimburse,
    p_settled_on: settledOn,
    p_allocations: result.allocations.map((a) => ({ partner_id: a.partnerId, amount_cents: a.amount })),
    p_transfers: result.transfers
      .filter((_, i) => includedTransfers[i])
      .map((t) => ({ from_account_id: t.from, to_account_id: t.to, amount_cents: t.amount })),
    p_breakdown: {
      invested: result.invested,
      sale: result.sale,
      profit: result.profit,
      costs: obj(input.costs),
      receipts: obj(input.receipts),
      targets: obj(result.targets),
      shares: input.shares.map((s) => ({ partner_id: s.partnerId, share_bp: s.bp })),
    } as Json,
  };
}
