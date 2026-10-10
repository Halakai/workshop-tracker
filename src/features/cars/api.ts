import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/database.types';
import { carTotals, isClosed, type CarMoney, type CarStatus } from '@/domain/cars';

export type CarRow = Tables<'cars'>;
export type CarTransaction = Tables<'transactions'>;

const CAR_SELECT =
  '*, seller:contacts!cars_seller_id_fkey(id, name, phone), buyer:contacts!cars_buyer_id_fkey(id, name, phone)';

async function fetchCars() {
  const [cars, summaries] = await Promise.all([
    supabase.from('cars').select(CAR_SELECT).order('created_at', { ascending: false }),
    supabase.from('car_summaries').select('*'),
  ]);
  if (cars.error) throw cars.error;
  if (summaries.error) throw summaries.error;
  const byCar = new Map(summaries.data.map((s) => [s.car_id, s]));
  return cars.data.map((car) => {
    const s = byCar.get(car.id);
    const money: CarMoney = {
      purchase: s?.purchase_cents ?? 0,
      stock: s?.stock_cents ?? 0,
      parts: s?.parts_cents ?? 0,
      otherCosts: s?.other_costs_cents ?? 0,
      sale: s?.sale_cents ?? 0,
    };
    return { ...car, money, totals: carTotals(money, car.status as CarStatus), saleCount: s?.sale_count ?? 0 };
  });
}
export type Car = Awaited<ReturnType<typeof fetchCars>>[number];

export const carKeys = {
  all: ['cars'] as const,
  money: (carId: string) => ['car-money', carId] as const,
  stock: (carId: string) => ['car-stock', carId] as const,
};

export function useCars() {
  return useQuery({ queryKey: carKeys.all, queryFn: fetchCars });
}

export function useCar(id: string | undefined) {
  const cars = useCars();
  return { ...cars, data: cars.data?.find((c) => c.id === id) };
}

/** Cars that can still take parts and costs: not sold/scrapped and not settled. */
export function useActiveCars() {
  const cars = useCars();
  return useMemo(
    () => (cars.data ?? []).filter((c) => !isClosed(c.status as CarStatus) && !c.settled_at),
    [cars.data],
  );
}

/** Every ledger entry of a car: purchase, parts bought, other costs, sale payments. */
export function useCarMoney(carId: string | undefined) {
  return useQuery({
    queryKey: carKeys.money(carId ?? ''),
    enabled: Boolean(carId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, expense_category:expense_categories(id, name)')
        .eq('car_id', carId!)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
export type CarMoneyRow = NonNullable<ReturnType<typeof useCarMoney>['data']>[number];

/** Parts used on the car from stock (and returned). */
export function useCarStock(carId: string | undefined) {
  return useQuery({
    queryKey: carKeys.stock(carId ?? ''),
    enabled: Boolean(carId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, item:items(id, name, part_number, unit:units(name, whole_only))')
        .eq('car_id', carId!)
        .order('seq', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
export type CarStockRow = NonNullable<ReturnType<typeof useCarStock>['data']>[number];

function useInvalidateCar() {
  const queryClient = useQueryClient();
  return (carId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: carKeys.all }),
      carId ? queryClient.invalidateQueries({ queryKey: carKeys.money(carId) }) : null,
      carId ? queryClient.invalidateQueries({ queryKey: carKeys.stock(carId) }) : null,
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    ]);
}

function refError(error: { code?: string; message: string }) {
  return error.code === '23505' && error.message.includes('ref')
    ? new Error('This car ID is already used by another car.')
    : error;
}

export function useCreateCar() {
  const invalidate = useInvalidateCar();
  return useMutation({
    mutationFn: async ({
      car,
      purchase,
    }: {
      car: TablesInsert<'cars'>;
      purchase: Omit<TablesInsert<'transactions'>, 'car_id'> | null;
    }) => {
      const { data, error } = await supabase.from('cars').insert(car).select().single();
      if (error) throw refError(error);
      if (purchase) {
        const { error: purchaseError } = await supabase.from('transactions').insert({ ...purchase, car_id: data.id });
        if (purchaseError) {
          throw new Error(`The car was saved, but not its purchase price: ${purchaseError.message}. Add it on the car page.`);
        }
      }
      return data;
    },
    onSuccess: (car) => invalidate(car.id),
  });
}

export function useUpdateCar() {
  const invalidate = useInvalidateCar();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TablesUpdate<'cars'> }) => {
      const { data, error } = await supabase.from('cars').update(values).eq('id', id).select();
      if (error) throw refError(error);
      if (!data.length) throw new Error('This car is settled and can’t be changed anymore.');
      return data[0];
    },
    onSuccess: (car) => invalidate(car.id),
  });
}

export function useDeleteCar() {
  const invalidate = useInvalidateCar();
  return useMutation({
    mutationFn: async (carId: string) => {
      const { count } = await supabase
        .from('stock_movements')
        .select('id', { count: 'exact', head: true })
        .eq('car_id', carId);
      if (count) throw new Error('Parts from stock were used on this car. Return them to stock first.');
      const { error: moneyError } = await supabase.from('transactions').delete().eq('car_id', carId);
      if (moneyError) throw moneyError;
      const { error } = await supabase.from('cars').delete().eq('id', carId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

export function useSaveCarTransaction() {
  const invalidate = useInvalidateCar();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'transactions'> }) => {
      if (id) {
        const { car_id: _car, category: _category, kind: _kind, ...editable } = values;
        const { data, error } = await supabase.from('transactions').update(editable).eq('id', id).select();
        if (error) throw error;
        if (!data.length) throw new Error('This car is settled; its money can’t be changed anymore.');
        return data[0];
      }
      const { data, error } = await supabase.from('transactions').insert(values).select().single();
      if (error) {
        if (error.code === '23505') throw new Error('This car already has a purchase price. Edit it instead.');
        throw error;
      }
      return data;
    },
    onSuccess: (row) => invalidate(row.car_id ?? undefined),
  });
}

export function useDeleteCarTransaction() {
  const invalidate = useInvalidateCar();
  return useMutation({
    mutationFn: async (row: CarTransaction) => {
      const { data, error } = await supabase.from('transactions').delete().eq('id', row.id).select();
      if (error) throw error;
      if (!data.length) throw new Error('This car is settled; its money can’t be changed anymore.');
    },
    onSuccess: (_d, row) => invalidate(row.car_id ?? undefined),
  });
}

/** Distinct values already used (for type-ahead): makes, models of a make, colours, fuels. */
export function useCarSuggestions(make?: string) {
  const cars = useCars();
  return useMemo(() => {
    const distinct = (values: (string | null | undefined)[]) =>
      [...new Set(values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim()))].sort((a, b) =>
        a.localeCompare(b),
      );
    const list = cars.data ?? [];
    const sameMake = make?.trim()
      ? list.filter((c) => c.make.toLowerCase() === make.trim().toLowerCase())
      : list;
    return {
      makes: distinct(list.map((c) => c.make)),
      models: distinct(sameMake.map((c) => c.model)),
      colours: distinct(list.map((c) => c.colour)),
      fuels: distinct(['Petrol', 'Diesel', 'LPG', 'Hybrid', 'Electric', ...list.map((c) => c.fuel)]),
      refs: list.map((c) => c.ref),
    };
  }, [cars.data, make]);
}
