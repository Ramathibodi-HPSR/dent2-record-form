-- D-77 (Percy, 2 Nov 2026 16:08): the v0.7 defaults stay, and the project now pays by them instead of only warning.
-- (1) Brushing kit 176: once per child per NHSO (Thai fiscal) year, Oct–Sep; repeats are keyed as 175, so the 2nd and
--     later 176 in the same year pay 0 (fee schedule 02).
-- (2) A second sealant 171 on the same tooth is paid only when an attended exam dated after the previous sealant
--     (171 or 172) of that tooth, and on or before this one, records the sealant as lost or partial: Code A 0 (none),
--     1 (partial) or 7 (material broken or lost). A 172 PRR is left as it was.
-- (3) Control arm (03): "เคลือบ sealant ได้ 1 ครั้งต่อปี", read per tooth: the same tooth sealed again in the same
--     fiscal year pays 0. 174 and 170 were already capped at once a year. Control units keep no money ceiling.
-- A refused sealant does not use up one of the two teeth NHSO's flat 500 covers.
create or replace function app.project_pay(p_arm text, p_coverage text, p_code text, p_place text, p_rate numeric, p_nhso numeric,
                                           p_nth_fy bigint, p_nth_month bigint, p_primary boolean, p_outside boolean, p_group boolean,
                                           out pay numeric, out note text)
language plpgsql immutable set search_path = '' as $$
declare v_none boolean := p_coverage = 'none';   -- null (not recorded yet) is treated as UC
begin
  pay := 0; note := null;
  if p_primary then note := 'ฟันน้ำนม ไม่นับในโครงการ'; return; end if;
  if p_arm = 'cap' then note := 'เหมาจ่ายรายหัว ไม่เบิกรายการ'; return; end if;
  if p_rate is null or p_outside then note := 'นอกรายการโครงการ เบิกตามระบบปกติ'; return; end if;
  if p_code in ('67210', '172') and coalesce(p_place, '') <> 'van' then note := 'ไม่ได้ทำบนรถทันตกรรม เบิกกองทุนทันตกรรม สปสช.'; return; end if;

  if p_arm = 'ffs' then
    if p_code = '170' and p_nth_month > 1 then note := 'ฟลูออไรด์เกินเดือนละ 1 ครั้ง'; return; end if;
    if p_code in ('174', '170') then
      if v_none then pay := p_rate;
      elsif p_nth_fy = 1 then pay := p_rate - p_nhso; note := 'เบิก สปสช. ' || p_nhso::int || ' บาทก่อน โครงการจ่ายส่วนต่าง';
      else pay := p_rate; note := 'ครั้งที่ ' || p_nth_fy || ' ในปีงบ สปสช. ไม่จ่าย'; end if;
    elsif p_code = '171' then
      if v_none then pay := p_rate;
      elsif p_nth_fy <= 2 then note := 'ซี่ที่ ' || p_nth_fy || ' ในปีงบ เบิก สปสช. (เหมา 500 บาท)';
      else pay := p_rate; end if;
    elsif p_code = '176' and p_nth_fy > 1 and not p_group then note := 'ชุดอุปกรณ์ปีละ 1 ครั้ง ฝึกซ้ำเบิกรหัส 175';
    elsif p_code in ('173', '175', '176', '177', '172', '67210') then pay := p_rate;
    else note := 'รักษา เบิกกองทุนทันตกรรม สปสช.'; end if;
    return;
  end if;

  -- control (03): 174, 170, 171 under NHSO rules, and the van filling for every child (D-74)
  if p_code in ('174', '170') then
    if p_nth_fy > 1 then note := 'เกินปีละ 1 ครั้งตามข้อกำหนด สปสช.';
    elsif v_none then pay := p_rate;
    else pay := p_rate - p_nhso; note := 'เบิก สปสช. ' || p_nhso::int || ' บาทก่อน โครงการจ่ายส่วนต่าง'; end if;
  elsif p_code = '171' then
    if v_none then pay := p_rate;
    elsif p_nth_fy <= 2 then note := 'ซี่ที่ ' || p_nth_fy || ' ในปีงบ เบิก สปสช. (เหมา 500 บาท)';
    else pay := p_rate; end if;
  elsif p_code = '67210' then pay := p_rate;
  else note := 'กลุ่มควบคุม ไม่อยู่ในรายการที่เบิกจากโครงการ'; end if;
end $$;

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
                        and e.teeth -> h.tooth::text ->> 'A' in ('0', '1', '7'))
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
