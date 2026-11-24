import { CarFront, CircleGauge, Cog, Disc3, Droplets, RefreshCcw, Snowflake, Waves, Zap, Wrench, type LucideIcon } from 'lucide-react';
import { MANUAL_JOBS, type ManualJob } from '@/domain/manualSearch';

const ICONS: Record<string, LucideIcon> = {
  'small-service': Droplets,
  'big-service': RefreshCcw,
  brakes: Disc3,
  clutch: Cog,
  suspension: Waves,
  engine: Wrench,
  electrics: Zap,
  data: CircleGauge,
  cooling: Snowflake,
  body: CarFront,
};

export const JOBS: (ManualJob & { icon: LucideIcon })[] = MANUAL_JOBS.map((job) => ({ ...job, icon: ICONS[job.id] ?? Wrench }));
