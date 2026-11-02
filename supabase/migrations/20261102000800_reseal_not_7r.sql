-- D-77 with D-78 (2 Nov 2026): a re-seal is paid after an exam records the sealant lost or partial. Since D-78 Code A 7
-- carries what was lost: 7s (sealant) or 7r (filling). A lost filling (7r) on a sealed tooth is not a lost sealant, so it
-- does not open a paid re-seal; 7 without the letter (recorded before D-78) still counts. Only that test changes.

-- The output columns stay those of v1.1 in the same order (create or replace view cannot shift them); nth_fy is
-- still the plain count, while project_pay gets the sealant count without refused sealants.
create or replace view public.v_services_pay with (security_invoker = true) as
with b as (
  select s.id, s.unit_id, s.study_id, s.code, s.tooth, s.service_date, s.status, s.place, s.group_id, s.transfer_id,
         u.arm, u.ptype, c.coverage, p.name as code_name, p.nhso_rate,
         case when p.code is null then null when u.arm = 'control' or u.ptype = 'public' then p.price_lc else p.price_full end as rate,
         coalesce(p.outside or p.unpriced, false) as outside,
         (s.tooth between 51 and 85) as primary_tooth,
         row_number() over (partition by s.study_id, s.code, extract(year from s.service_date + interval '3 months')
                            order by s.service_date, s.id) as nth_fy,
         row_number() over (partition by s.study_id, s.code, date_trunc('month', s.service_date)
                            order by s.service_date, s.id) as nth_month
    from public.services s
    join public.units u on u.id = s.unit_id
    left join public.children c on c.study_id = s.study_id
    left join public.price_list p on p.code = s.code
         and s.service_date >= p.valid_from and (p.valid_to is null or s.service_date < p.valid_to)
),
-- sealant history of the child's tooth: date of the previous 171/172, and which 171 of the fiscal year this is
h as (
  select b.*,
         max(b.service_date) filter (where b.code in ('171', '172'))
           over (partition by b.study_id, b.tooth order by b.service_date, b.id
                 rows between unbounded preceding and 1 preceding) as prev_seal_on,
         count(*) filter (where b.code = '171')
           over (partition by b.study_id, b.tooth, extract(year from b.service_date + interval '3 months')
                 order by b.service_date, b.id rows between unbounded preceding and current row) as seal_nth_tooth_fy
    from b
),
k as (
  select h.*,
         case when h.code <> '171' or h.study_id is null or h.tooth is null or h.primary_tooth or h.arm = 'cap' then null
              when h.arm = 'control' and h.seal_nth_tooth_fy > 1 then 'เกินปีละ 1 ครั้งตามข้อกำหนด สปสช.'
              when h.prev_seal_on is not null and not exists (
                     select 1 from public.exams e
                      where e.study_id = h.study_id and e.attended
                        and e.exam_date > h.prev_seal_on and e.exam_date <= h.service_date
                        and e.teeth -> h.tooth::text ->> 't' = 'p'
                        and (e.teeth -> h.tooth::text ->> 'A' in ('0', '1')
                             or (e.teeth -> h.tooth::text ->> 'A' = '7' and coalesce(e.teeth -> h.tooth::text ->> 'lost', 's') <> 'r')))
                then 'ซี่นี้เคลือบแล้ว จ่ายเคลือบซ้ำเมื่อผลตรวจบันทึกว่าหลุดหรือเหลือบางส่วน'
         end as seal_block
    from h
),
c as (
  select k.*,
         case when k.code = '171' and k.seal_block is null
              then row_number() over (partition by k.study_id, k.code, extract(year from k.service_date + interval '3 months'),
                                                   k.seal_block is null
                                          order by k.service_date, k.id)
              else k.nth_fy end as nth_fy_pay
    from k
)
select c.id, c.unit_id, c.study_id, c.code, c.tooth, c.service_date, c.status, c.place, c.group_id, c.transfer_id,
       c.arm, c.ptype, c.coverage, c.code_name, c.nhso_rate, c.rate, c.outside, c.primary_tooth, c.nth_fy, c.nth_month,
       (extract(year from c.service_date + interval '3 months'))::int + 543 as fiscal_year_be,
       case when c.seal_block is not null then 0 else x.pay end as project_pay,
       coalesce(c.seal_block, x.note) as pay_note
  from c
 cross join lateral app.project_pay(c.arm, c.coverage, c.code, c.place, c.rate, coalesce(c.nhso_rate, 0),
                                    c.nth_fy_pay, c.nth_month, coalesce(c.primary_tooth, false), c.outside, c.study_id is null) x;
grant select on public.v_services_pay to authenticated;
revoke all on public.v_services_pay from anon;
