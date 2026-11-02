-- Percy 2 Nov 2026 (13:40): an index tooth for PI/GI may be not erupted yet or impossible to assess (some children
-- have only 3 of the 6). Each tooth is either scored ({pi, gi} 0–3) or marked {x: 'ne'} (ยังไม่ขึ้น) or
-- {x: 'na'} (ตรวจไม่ได้). The means in v_exam_summary already average only the scored teeth.
create or replace function app.valid_pigi(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1 from jsonb_each(p) j
    where j.key not in ('16B', '11La', '26B', '46Li', '31La', '36Li')
       or not (
         (coalesce(j.value ->> 'x', '') in ('ne', 'na') and j.value ->> 'pi' is null and j.value ->> 'gi' is null)
         or (j.value ->> 'x' is null and coalesce(j.value ->> 'pi', '') ~ '^[0-3]$' and coalesce(j.value ->> 'gi', '') ~ '^[0-3]$')
       )
  )
$$;
