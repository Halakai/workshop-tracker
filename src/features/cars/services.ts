// Services and parts of a car (docs/PLAN.md §13, V2): the database side.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/database.types';
import { serviceTotal } from '@/domain/carServices';
import { carKeys, useCarMoney, useCarStock } from './api';

export type ServiceType = Tables<'service_types'>;

export const serviceKeys = {
  types: ['service_types'] as const,
  services: (carId: string) => ['car-services', carId] as const,
  parts: (carId: string) => ['car-parts', carId] as const,
};

export function useServiceTypes() {
  return useQuery({
    queryKey: serviceKeys.types,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('service_types').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCarServices(carId: string | undefined) {
  return useQuery({
    queryKey: serviceKeys.services(carId ?? ''),
    enabled: Boolean(carId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('car_services')
        .select('*, type:service_types(id, name)')
        .eq('car_id', carId!)
        .order('performed_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
export type CarService = NonNullable<ReturnType<typeof useCarServices>['data']>[number];

export function useCarParts(carId: string | undefined) {
  return useQuery({
    queryKey: serviceKeys.parts(carId ?? ''),
    enabled: Boolean(carId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('car_parts')
        .select('*, brand:brands(id, name)')
        .eq('car_id', carId!)
        .order('bought_on', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
export type CarPart = NonNullable<ReturnType<typeof useCarParts>['data']>[number];

/** Garages typed on services before (type-ahead for "Another garage"). */
export function useGarages() {
  return useQuery({
    queryKey: ['car-service-garages'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('car_services').select('garage').not('garage', 'is', null);
      if (error) throw error;
      return [...new Set(data.map((r) => r.garage).filter((g): g is string => Boolean(g)))].sort((a, b) => a.localeCompare(b));
    },
  });
}

/**
 * What is filed under each service of a car, and its total: costs and stock (workshop cars), parts and stock
 * (members' cars), and the work price.
 */
export function useServiceMoney(car: { id: string; owner_kind: string }) {
  const money = useCarMoney(car.owner_kind === 'workshop' ? car.id : undefined);
  const stock = useCarStock(car.owner_kind === 'customer' ? undefined : car.id);
  const parts = useCarParts(car.owner_kind === 'member' ? car.id : undefined);
  const ready = (car.owner_kind !== 'workshop' || money.isSuccess) && (car.owner_kind === 'customer' || stock.isSuccess) && (car.owner_kind !== 'member' || parts.isSuccess);
  const of = (serviceId: string) => ({
    costs: (money.data ?? []).filter((r) => r.service_id === serviceId),
    stock: (stock.data ?? []).filter((r) => r.service_id === serviceId),
    parts: (parts.data ?? []).filter((p) => p.service_id === serviceId),
  });
  const total = (s: { id: string; labor_cents: number | null }) => {
    const filed = of(s.id);
    return serviceTotal({
      labor: s.labor_cents,
      parts: filed.parts.map((p) => p.price_cents),
      costs: filed.costs.map((r) => r.amount_cents),
      stock: filed.stock.map((r) => -r.value_delta_cents),
    });
  };
  return { ready, of, total, money: money.data ?? [], stock: stock.data ?? [], parts: parts.data ?? [] };
}

/** "Small service: oil and filters" — what a service was. */
export function serviceTitle(s: Pick<CarService, 'description' | 'type'>): string {
  const what = s.description?.trim().split('\n')[0];
  if (s.type && what) return `${s.type.name}: ${what}`;
  return s.type?.name ?? what ?? 'Service';
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return (carId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: serviceKeys.services(carId) }),
      queryClient.invalidateQueries({ queryKey: serviceKeys.parts(carId) }),
      queryClient.invalidateQueries({ queryKey: carKeys.money(carId) }),
      queryClient.invalidateQueries({ queryKey: carKeys.stock(carId) }),
      queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    ]);
}

export function useSaveService() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'car_services'> }) => {
      if (id) {
        const { car_id: _car, ...editable } = values;
        const { data, error } = await supabase.from('car_services').update(editable as TablesUpdate<'car_services'>).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('car_services').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => invalidate(s.car_id),
  });
}

export function useDeleteService() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (s: { id: string; car_id: string }) => {
      const { error } = await supabase.from('car_services').delete().eq('id', s.id);
      if (error) throw error;
    },
    onSuccess: (_d, s) => invalidate(s.car_id),
  });
}

export function useSavePart() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'car_parts'> }) => {
      if (id) {
        const { car_id: _car, ...editable } = values;
        const { data, error } = await supabase.from('car_parts').update(editable as TablesUpdate<'car_parts'>).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('car_parts').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => invalidate(p.car_id),
  });
}

export function useDeletePart() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: { id: string; car_id: string }) => {
      const { error } = await supabase.from('car_parts').delete().eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: (_d, p) => invalidate(p.car_id),
  });
}

/** Files a cost (a transaction or a use of stock) under a service of its car, or takes it out (null). */
export function useFileCost() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (args: { carId: string; serviceId: string | null } & ({ transactionId: string } | { movementId: string })) => {
      if ('transactionId' in args) {
        const { data, error } = await supabase.from('transactions').update({ service_id: args.serviceId }).eq('id', args.transactionId).select('id');
        if (error) throw error;
        if (!data.length) throw new Error('This car is settled; its costs can’t be changed anymore.');
      } else {
        // null takes it out of its service (the generated types don't know the argument can be null)
        const { error } = await supabase.rpc('set_movement_service', { p_movement_id: args.movementId, p_service_id: args.serviceId as string });
        if (error) throw error;
      }
    },
    onSuccess: (_d, args) => invalidate(args.carId),
  });
}
