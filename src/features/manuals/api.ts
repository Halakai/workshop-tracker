import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import type { Tables } from '@/lib/database.types';
import { bestManual, findManuals, manualPrefixes, manualTitle, type ManualCar, type ManualMatch } from '@/domain/manuals';
import { engineParts, forParts, gearboxParts, guessEngineParts, readManual, type ManualIndex } from '@/domain/manualSearch';
import { findMake, sameName, useCarGenerations, useCarMakes, useCarModels, type CarGeneration } from '@/features/catalog/carCatalog';

export type CarManual = Tables<'car_manuals'>;

export const manualKeys = {
  find: (prefixes: readonly string[]) => ['manuals', 'find', ...prefixes] as const,
  words: (words: string) => ['manuals', 'words', words] as const,
  open: (slug: string) => ['manuals', 'open', slug] as const,
  choices: ['car-manuals'] as const,
};

async function callManuals<T>(path: 'find' | 'open', body: Record<string, unknown>): Promise<T> {
  if (import.meta.env.DEV) {
    // `npm run dev` answers these itself (vite.config.ts), so manuals work before the function is deployed
    const res = await fetch(`${import.meta.env.BASE_URL}__manuals/${path}`, { method: 'POST', body: JSON.stringify(body) });
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
    return json;
  }
  const { data, error } = await supabase.functions.invoke(`manuals/${path}`, { body });
  if (error) throw new Error(await errorMessage(error));
  return data as T;
}

/** The names of a make's manuals. */
export function useMakeManuals(make: string | null | undefined) {
  const prefixes = manualPrefixes(make);
  return useQuery({
    queryKey: manualKeys.find(prefixes),
    enabled: prefixes.length > 0,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    queryFn: async () => (await callManuals<{ slugs: string[] }>('find', { prefixes })).slugs,
  });
}

/** Manuals whose name has these words ("passat b5"), for choosing one by hand. */
export function useManualsByWords(words: string) {
  const query = words.trim().toLowerCase();
  return useQuery({
    queryKey: manualKeys.words(query),
    enabled: query.length >= 2,
    staleTime: 60 * 60_000,
    retry: 1,
    placeholderData: (previous) => previous,
    queryFn: async () => (await callManuals<{ slugs: string[] }>('find', { words: query })).slugs,
  });
}

/** A manual's index. Big (up to a megabyte), so it is only loaded when a manual is opened. */
export function useManual(slug: string | null | undefined) {
  return useQuery({
    queryKey: manualKeys.open(slug ?? ''),
    enabled: Boolean(slug),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
    queryFn: () => callManuals<ManualIndex>('open', { slug }),
  });
}

/** Saved instead of names when every engine and gearbox should be shown (nothing saved: the app guesses the engine). */
export const ALL_PARTS = '*';

/** The pages of a manual for this car: the chosen parts, or the engine the app guesses. */
export function useManualPages(slug: string | null | undefined, car: ManualCar, chosen: readonly string[]) {
  const manual = useManual(slug);
  const all = useMemo(() => (manual.data ? readManual(manual.data) : []), [manual.data]);
  const engines = useMemo(() => engineParts(all), [all]);
  const gearboxes = useMemo(() => gearboxParts(all), [all]);
  const guessed = useMemo(() => guessEngineParts(engines, car), [engines, car]);
  const parts = chosen.length > 0 ? chosen : guessed;
  const pages = useMemo(() => forParts(all, parts), [all, parts]);
  return { manual, engines, gearboxes, guessed, parts, pages };
}

// ---------------------------------------------------------------------------
// Which manual belongs to a car
// ---------------------------------------------------------------------------
function useChoices() {
  return useQuery({
    queryKey: manualKeys.choices,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from('car_manuals').select('*');
      if (error) throw error;
      return data;
    },
  });
}

const text = (value: string | null | undefined) => (value ?? '').trim();

function choiceFor(choices: readonly CarManual[] | undefined, car: ManualCar): CarManual | undefined {
  return choices?.find(
    (c) =>
      sameName(c.make, text(car.make)) &&
      sameName(c.model, text(car.model)) &&
      sameName(c.generation, text(car.generation)) &&
      sameName(c.engine, text(car.engine)),
  );
}

const covers = (g: CarGeneration, year: number) => (g.year_from ?? 0) <= year && (g.year_to ?? 9999) >= year;

/** The car with its generation's years; a car without a generation gets every generation made in its year. */
function useGenerations(car: ManualCar): { cars: ManualCar[]; loading: boolean } {
  const makes = useCarMakes();
  const make = findMake(makes.data, text(car.make));
  const models = useCarModels(make?.id);
  const model = text(car.model) ? models.data?.find((m) => sameName(m.name, text(car.model))) : undefined;
  const generations = useCarGenerations(model?.id);
  const loading = makes.isLoading || models.isLoading || generations.isLoading;
  const { make: carMake, model: carModel, generation, year, engine, fuel } = car;
  const cars = useMemo(() => {
    const base: ManualCar = { make: carMake, model: carModel, generation, year, engine, fuel };
    const withYears = (g: CarGeneration): ManualCar => ({ ...base, generation: g.name, yearFrom: g.year_from, yearTo: g.year_to });
    const known = generations.data ?? [];
    if (text(generation)) {
      const g = known.find((x) => sameName(x.name, text(generation)));
      return [g ? withYears(g) : base];
    }
    const made = year ? known.filter((g) => covers(g, year)) : [];
    return made.length > 0 ? made.map(withYears) : [base];
  }, [generations.data, carMake, carModel, generation, year, engine, fuel]);
  return { cars, loading };
}

/** The car's manual: the team's choice, else the best match; and the other candidates. */
export function useCarManual(car: ManualCar) {
  const named = Boolean(text(car.make) && text(car.model));
  const list = useMakeManuals(named ? car.make : null);
  const choices = useChoices();
  const { cars, loading } = useGenerations(car);
  const matches = useMemo(() => {
    const found = new Map<string, ManualMatch>();
    for (const c of cars) {
      for (const m of findManuals(c, list.data ?? [])) {
        const old = found.get(m.slug);
        if (!old || old.score < m.score) found.set(m.slug, m);
      }
    }
    return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 12);
  }, [cars, list.data]);

  const choice = choiceFor(choices.data, car);
  const best = bestManual(matches);
  const slug = choice?.manual_slug ?? best?.slug ?? null;
  return {
    /** the car has a make and a model */
    named,
    loading: named && (list.isLoading || choices.isLoading || loading),
    error: choice ? null : list.error,
    matches,
    choice,
    slug,
    title: slug ? manualTitle(slug) : null,
    fit: choice ? ('chosen' as const) : (best?.fit ?? null),
    /** the car as the app understands it (the generation's years), for guessing the engine */
    car: cars[0] ?? car,
  };
}

export function useSaveCarManual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ car, choice, slug, parts }: { car: ManualCar; choice?: CarManual; slug: string; parts: string[] }) => {
      const values = { manual_slug: slug, parts };
      if (choice) {
        const { error } = await supabase.from('car_manuals').update(values).eq('id', choice.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('car_manuals').insert({
        make: text(car.make),
        model: text(car.model),
        generation: text(car.generation),
        engine: text(car.engine),
        ...values,
      });
      // someone else chose one a moment ago: theirs is loaded again, and can be changed
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: manualKeys.choices }),
  });
}
