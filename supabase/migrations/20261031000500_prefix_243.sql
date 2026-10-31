-- Percy, 31 Oct 2026: clinic 243 uses study ID prefix 45 (not 43). No child was enrolled under 43.
update public.units set id_prefix = '45' where id = 'u243';
