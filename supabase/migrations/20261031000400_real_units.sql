-- Real public units (Percy, 31 Oct 2026): BMA dental clinics under กองทันตสาธารณสุข สำนักอนามัย.
-- Study ID prefix = last two digits of the clinic number (D-64). Arms: 321 control, 654 capitation,
-- 243 shared savings (fee schedule 02). Schools and first visit days from letters Dent2569/05–08.
-- Examiner codes are placeholders per unit (<clinic>-1 … -5): each unit assigns them to its staff and keeps
-- that list itself; calibration results (WS1-5) are added later. Private clinics are not contacted yet.

insert into public.units (id, letter, name, arm, ptype, day1, is_test, id_prefix, clinic_code) values
  ('u243', 'G', 'คลินิกทันตกรรม 243', 'ffs',     'public', '2026-11-09', false, '43', '243'),
  ('u321', 'H', 'คลินิกทันตกรรม 321', 'control', 'public', '2026-11-18', false, '21', '321'),
  ('u654', 'I', 'คลินิกทันตกรรม 654', 'cap',     'public', '2026-11-05', false, '54', '654');

insert into public.schools (id, unit_id, seq, name) values
  ('u243-01', 'u243', 1, 'โรงเรียนมีนบุรี'),
  ('u321-01', 'u321', 1, 'โรงเรียนวัดธาตุทอง (เรือนเขียวสะอาด)'),
  ('u654-01', 'u654', 1, 'โรงเรียนนาหลวง');

insert into public.examiners (code, unit_id)
select u.clinic_code || '-' || n, u.id
  from public.units u cross join generate_series(1, 5) n
 where u.id in ('u243', 'u321', 'u654');
