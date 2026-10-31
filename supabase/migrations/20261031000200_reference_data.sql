-- Reference data for v1.0 testing: six TEST units (one per provider type × arm, as in prototype v0.7),
-- one test school each, two test examiner codes each, and the v0.7 price list.
-- The real units, schools and calibrated examiners (WS1-2, WS1-5) replace these before real data (~2 Nov).

insert into public.units (id, letter, name, arm, ptype, day1, is_test) values
  ('public-control',  'A', 'หน่วยทดสอบ ก · ศบส. กลุ่มควบคุม',            'control', 'public',  '2026-11-02', true),
  ('public-cap',      'B', 'หน่วยทดสอบ ข · ศบส. เหมาจ่ายรายหัว',          'cap',     'public',  '2026-11-02', true),
  ('public-ffs',      'C', 'หน่วยทดสอบ ค · ศบส. งบรวมแบ่งปันส่วนประหยัด',  'ffs',     'public',  '2026-11-02', true),
  ('private-control', 'D', 'หน่วยทดสอบ ง · คลินิกเอกชน กลุ่มควบคุม',       'control', 'private', '2026-11-02', true),
  ('private-cap',     'E', 'หน่วยทดสอบ จ · คลินิกเอกชน เหมาจ่ายรายหัว',     'cap',     'private', '2026-11-02', true),
  ('private-ffs',     'F', 'หน่วยทดสอบ ฉ · คลินิกเอกชน งบรวมแบ่งปันส่วนประหยัด', 'ffs', 'private', '2026-11-02', true);

insert into public.schools (id, unit_id, seq, name) values
  ('A-01', 'public-control',  1, 'โรงเรียนทดสอบ ก'),
  ('B-01', 'public-cap',      1, 'โรงเรียนทดสอบ ข'),
  ('C-01', 'public-ffs',      1, 'โรงเรียนทดสอบ ค'),
  ('D-01', 'private-control', 1, 'โรงเรียนทดสอบ ง'),
  ('E-01', 'private-cap',     1, 'โรงเรียนทดสอบ จ'),
  ('F-01', 'private-ffs',     1, 'โรงเรียนทดสอบ ฉ');

insert into public.examiners (code, unit_id) values
  ('TEST-A1', 'public-control'),  ('TEST-A2', 'public-control'),
  ('TEST-B1', 'public-cap'),      ('TEST-B2', 'public-cap'),
  ('TEST-C1', 'public-ffs'),      ('TEST-C2', 'public-ffs'),
  ('TEST-D1', 'private-control'), ('TEST-D2', 'private-control'),
  ('TEST-E1', 'private-cap'),     ('TEST-E2', 'private-cap'),
  ('TEST-F1', 'private-ffs'),     ('TEST-F2', 'private-ffs');

-- Prices from the cost workbook as in prototype v0.7 (lc = no LC, full = 100% LC). Reference values only in v1.0.
-- 68 and 178 are primary-teeth items, outside the project budget since D-54.
insert into public.price_list (code, name, short, unit, price_lc, price_full, tooth_rule, group_kind, unpriced, outside, control_claimable, control_per_year) values
  ('174', 'ตรวจช่องปากและประเมินความเสี่ยง ที่โรงเรียน', 'ตรวจ', 'คน', 143.30, 182.93, null, null, false, false, false, null),
  ('173', 'ตรวจฟันและประเมินความเสี่ยง ที่หน่วยบริการ', 'ตรวจที่หน่วย', 'คน', 193.03, 232.65, null, null, false, false, false, null),
  ('176', 'ฝึกแปรงฟัน + อุปกรณ์ทำความสะอาด', 'ฝึกแปรงฟัน', 'คน', 159.45, 254.55, null, 'person', false, false, false, null),
  ('175', 'ฝึกแปรงฟันรายบุคคล', 'ฝึกแปรงฟันซ้ำ', 'คน', 78.91, 158.16, null, 'person', false, false, false, null),
  ('177', 'ทันตสุขศึกษาที่โรงเรียน', 'สุขศึกษา', 'ครั้ง', 207.66, 508.81, null, 'session', false, false, false, null),
  ('170', 'ขัดฟัน + เคลือบฟลูออไรด์ทั้งปาก', 'ฟลูออไรด์', 'ครั้ง', 256.17, 335.42, null, null, false, false, true, 1),
  ('171', 'เคลือบหลุมร่องฟัน', 'เคลือบ', 'ซี่', 242.22, 353.17, 'fpm', null, false, false, true, null),
  ('172', 'PRR (preventive resin restoration)', 'PRR', 'ซี่', 323.51, 497.86, 'any', null, false, false, false, null),
  ('55', 'อุดฟันสีเหมือนฟัน 1 ด้าน', 'อุด', 'ซี่', 386.35, 584.48, 'any', null, false, false, true, null),
  ('56', 'อุดฟันสีเหมือนฟัน 2 ด้าน', 'อุด', 'ซี่', 437.20, 730.42, 'any', null, false, false, true, null),
  ('57', 'อุดฟันสีเหมือนฟัน 3 ด้าน', 'อุด', 'ซี่', 460.67, 787.67, 'any', null, false, false, true, null),
  ('68', 'Pulpotomy ฟันน้ำนม', 'pulpotomy', 'ซี่', 0, 0, 'prim', null, false, true, false, null),
  ('178', 'ครอบฟันโลหะ (SSC)', 'SSC', 'ซี่', 0, 0, 'prim', null, false, true, false, null),
  ('1', 'ถอนฟัน', 'ถอน', 'ซี่', 206.99, 325.86, 'any', null, false, false, true, null),
  ('SDF', 'ทา SDF 38%', 'SDF', 'ซี่', 0, 0, 'any', null, true, false, false, null),
  ('REF', 'ส่งต่อ', 'ส่งต่อ', 'ครั้ง', 0, 0, 'opt', null, false, true, false, null);
