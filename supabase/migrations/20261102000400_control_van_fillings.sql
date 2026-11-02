-- D-74 (Percy, 2 Nov 2026 11:10): the control arm (03) pays fillings on the mobile dental unit at school for every
-- child, not only for children with no public coverage. Other treatment still goes to the NHSO dental fund.
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
