-- Fix: the brand backfill in 20261010120531_m2_lists cut codes down to 2 letters
-- (rpad() also shortens strings that are longer than the target length).
-- Recompute those codes (first 4 letters) and the part numbers generated from them.
-- Only touches brands created by that migration (created_by is null) that still have a 2-letter code.

with letters as (
  select b.id, b.code as old_code,
         left(upper(regexp_replace(translate(b.name, 'ČĆŠŽĐčćšžđ', 'CCSZDccszd'), '[^A-Za-z0-9]', '', 'g')), 4) as l
  from public.brands b
  where b.created_by is null and char_length(b.code) = 2
), based as (
  select id, old_code, case when char_length(l) < 2 then rpad(l, 2, 'X') else l end as base from letters
), fix as (
  select id, old_code,
         case when row_number() over (partition by base order by id) = 1 then base
              else left(base, 5) || row_number() over (partition by base order by id) end as new_code
  from based
)
update public.items i
set part_number = regexp_replace(i.part_number, '^([A-Z0-9]+)-' || f.old_code || '-', '\1-' || f.new_code || '-')
from fix f
where i.brand_id = f.id and i.part_number ~ ('^[A-Z0-9]+-' || f.old_code || '-[0-9]+$');

with letters as (
  select b.id,
         left(upper(regexp_replace(translate(b.name, 'ČĆŠŽĐčćšžđ', 'CCSZDccszd'), '[^A-Za-z0-9]', '', 'g')), 4) as l
  from public.brands b
  where b.created_by is null and char_length(b.code) = 2
), based as (
  select id, case when char_length(l) < 2 then rpad(l, 2, 'X') else l end as base from letters
), fix as (
  select id,
         case when row_number() over (partition by base order by id) = 1 then base
              else left(base, 5) || row_number() over (partition by base order by id) end as new_code
  from based
)
update public.brands b
set code = f.new_code
from fix f
where f.id = b.id and b.code <> f.new_code;
