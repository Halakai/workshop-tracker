// Car makes, models, generations and engines: suggestions for the car and job forms.
// A shared list: anything new typed on a form is added when the form is saved; admins tidy it up in Lists.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { Tables } from '@/lib/database.types';
import { fold } from '@/domain/search';

export type CarMake = Pick<Tables<'car_makes'>, 'id' | 'name' | 'logo'>;
export type CarEngine = Pick<Tables<'car_engines'>, 'id' | 'name' | 'fuel' | 'power_kw'>;
export type CarGeneration = Pick<Tables<'car_generations'>, 'id' | 'name' | 'year_from' | 'year_to'> & { engines: CarEngine[] };

export const carCatalogKeys = {
  makes: ['car-makes'] as const,
  models: (makeId: string) => ['car-models', makeId] as const,
  generations: (modelId: string) => ['car-generations', modelId] as const,
};

/** Same name ignoring case, accents and extra spaces: "skoda" is Škoda. */
export const sameName = (a: string, b: string) => fold(a.trim()) === fold(b.trim());
const same = sameName;

/** "/workshop-tracker/car-logos/skoda.svg" */
export function logoUrl(logo: string): string {
  return `${import.meta.env.BASE_URL}car-logos/${logo}`;
}

export function useCarMakes() {
  return useQuery({
    queryKey: carCatalogKeys.makes,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('car_makes').select('id, name, logo').order('name');
      if (error) throw error;
      return data;
    },
  });
}

/** The catalogue entry for a make typed in any case or without accents ("skoda" → Škoda). */
export function findMake(makes: readonly CarMake[] | undefined, name: string): CarMake | undefined {
  return name.trim() ? makes?.find((m) => same(m.name, name)) : undefined;
}

export function useMakeLogo(name: string | null | undefined): string | null {
  const makes = useCarMakes();
  return (name && findMake(makes.data, name)?.logo) || null;
}

export function useCarModels(makeId: string | undefined) {
  return useQuery({
    queryKey: carCatalogKeys.models(makeId ?? ''),
    enabled: Boolean(makeId),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('car_models').select('id, name').eq('make_id', makeId!).order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCarGenerations(modelId: string | undefined) {
  return useQuery({
    queryKey: carCatalogKeys.generations(modelId ?? ''),
    enabled: Boolean(modelId),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<CarGeneration[]> => {
      const { data, error } = await supabase
        .from('car_generations')
        .select('id, name, year_from, year_to, engines:car_engines(id, name, fuel, power_kw)')
        .eq('model_id', modelId!)
        .order('year_from', { nullsFirst: false })
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

/** "1997–2003", "2019–", "" */
export function yearsLabel(g: Pick<CarGeneration, 'year_from' | 'year_to'>): string {
  if (!g.year_from && !g.year_to) return '';
  return `${g.year_from ?? ''}–${g.year_to ?? ''}`;
}

const covers = (g: Pick<CarGeneration, 'year_from' | 'year_to'>, year: number) =>
  (g.year_from === null || g.year_from <= year) && (g.year_to === null || g.year_to >= year);

/**
 * Suggestions for the car fields, from the catalogue plus what was typed on earlier cars.
 * Engines come from the chosen generation, else from the generations made in the given year, else from all.
 */
export function useCarFieldOptions(v: { make: string; model: string; generation: string; year: string }, extra: { makes?: string[]; models?: string[] } = {}) {
  const makes = useCarMakes();
  const make = findMake(makes.data, v.make);
  const models = useCarModels(make?.id);
  const model = v.model.trim() ? models.data?.find((m) => same(m.name, v.model)) : undefined;
  const generations = useCarGenerations(model?.id);

  return useMemo(() => {
    const year = /^\d{4}$/.test(v.year.trim()) ? Number(v.year) : null;
    const gens = generations.data ?? [];
    const generation = v.generation.trim() ? gens.find((g) => same(g.name, v.generation)) : undefined;
    // the generations made in that year first
    const sortedGens = year === null ? gens : [...gens.filter((g) => covers(g, year)), ...gens.filter((g) => !covers(g, year))];
    const engineSource = generation ? [generation] : year !== null && gens.some((g) => covers(g, year)) ? gens.filter((g) => covers(g, year)) : gens;
    const engines = new Map<string, CarEngine>();
    for (const g of engineSource) for (const e of g.engines) if (!engines.has(e.name)) engines.set(e.name, e);
    const fuelOrder = ['Petrol', 'Diesel', 'LPG', 'CNG', 'Hybrid', 'Plug-in hybrid', 'Electric'];
    const engineList = [...engines.values()].sort(
      (a, b) => fuelOrder.indexOf(a.fuel ?? '') - fuelOrder.indexOf(b.fuel ?? '') || (a.power_kw ?? 0) - (b.power_kw ?? 0) || a.name.localeCompare(b.name),
    );
    const union = (first: string[], second: string[] = []) => [...new Set([...first, ...second.filter((s) => !first.some((f) => same(f, s)))])];

    return {
      make,
      makes: union(extra.makes ?? [], (makes.data ?? []).map((m) => m.name)),
      models: union((models.data ?? []).map((m) => m.name), extra.models),
      generations: sortedGens,
      generationNames: sortedGens.map((g) => g.name),
      generationMatch: generation,
      engines: engineList,
      engineNames: engineList.map((e) => e.name),
      /** the year range to show next to a generation chip, and whether it fits the year typed */
      generationInfo: (name: string) => {
        const g = gens.find((x) => x.name === name);
        return g ? { years: yearsLabel(g), fits: year === null || covers(g, year) } : null;
      },
      engineFuel: (name: string) => engines.get(name)?.fuel ?? null,
      /** what to save: the catalogue's spelling when the typed text matches an entry ("skoda" → Škoda) */
      canonical: (typed: { make: string; model: string; generation: string; engine: string }) => ({
        make: make?.name ?? typed.make.trim(),
        model: model?.name ?? typed.model.trim(),
        generation: generation?.name ?? typed.generation.trim(),
        engine: gens.flatMap((g) => g.engines).find((e) => same(e.name, typed.engine))?.name ?? typed.engine.trim(),
      }),
    };
  }, [make, model, makes.data, models.data, generations.data, v.year, v.generation, extra.makes, extra.models]);
}

/**
 * Adds what was typed on a car or job form to the catalogue, so it's suggested next time.
 * Never fails the form: duplicates added at the same moment by someone else are fine.
 */
export async function rememberCar(v: { make: string; model: string; generation?: string; year?: number | null; engine?: string; fuel?: string }) {
  try {
    const makeName = v.make.trim();
    const modelName = v.model.trim();
    if (!makeName) return;
    const makeId = await findOrAdd('car_makes', { name: makeName }, {});
    if (!makeId || !modelName) return;
    const modelId = await findOrAdd('car_models', { name: modelName }, { make_id: makeId });
    const genName = v.generation?.trim();
    if (!modelId || !genName) return;
    const genId = await findOrAdd('car_generations', { name: genName, year_from: v.year ?? null, year_to: v.year ?? null }, { model_id: modelId });
    const engineName = v.engine?.trim();
    if (!genId || !engineName) return;
    await findOrAdd('car_engines', { name: engineName }, { generation_id: genId, fuel: v.fuel?.trim() || null });
  } catch (e) {
    console.warn('Could not add to the car catalogue', e);
  } finally {
    void queryClient.invalidateQueries({ queryKey: carCatalogKeys.makes });
    void queryClient.invalidateQueries({ queryKey: ['car-models'] });
    void queryClient.invalidateQueries({ queryKey: ['car-generations'] });
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

type CatalogTable = 'car_makes' | 'car_models' | 'car_generations' | 'car_engines';
type Lookup = PromiseLike<{ data: { id: string }[] | null }> & {
  eq(column: string, value: string): Lookup;
  is(column: string, value: null): Lookup;
  ilike(column: string, pattern: string): Lookup;
};

/** The id of the entry with this name (ignoring case) under these parents, adding it when there is none. */
async function findOrAdd(
  table: CatalogTable,
  values: { name: string } & Record<string, unknown>,
  parents: Record<string, string | null>,
): Promise<string | null> {
  const find = async () => {
    let query = supabase.from(table).select('id') as unknown as Lookup;
    for (const [column, value] of Object.entries(parents)) query = value === null ? query.is(column, null) : query.eq(column, value);
    const { data } = await query.ilike('name', escapeLike(values.name));
    return data?.[0]?.id ?? null;
  };
  const existing = await find();
  if (existing) return existing;
  const { data, error } = await supabase
    .from(table as 'car_makes')
    .insert({ ...parents, ...values } as never)
    .select('id')
    .single();
  if (error) return error.code === '23505' ? find() : null;
  return data.id;
}
