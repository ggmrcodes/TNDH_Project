-- ============================================
-- Hospital directory expansion + create-or-get RPC
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-26-clinician-onboarding-design.md
-- Phase: A

-- Expanded curated seed. on conflict (code) keeps the 3 existing rows
-- and is safe to re-run. Codes are stable slugs.
insert into public.hospitals (name_th, name_en, code, region) values
  ('โรงพยาบาลจุฬาลงกรณ์', 'King Chulalongkorn Memorial Hospital', 'chulalongkorn', 'central'),
  ('โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ', 'Thammasat University Hospital', 'thammasat', 'central'),
  ('โรงพยาบาลพระมงกุฎเกล้า', 'Phramongkutklao Hospital', 'phramongkutklao', 'central'),
  ('โรงพยาบาลราชวิถี', 'Rajavithi Hospital', 'rajavithi', 'central'),
  ('โรงพยาบาลภูมิพลอดุลยเดช', 'Bhumibol Adulyadej Hospital', 'bhumibol', 'central'),
  ('สถาบันสุขภาพเด็กแห่งชาติมหาราชินี', 'Queen Sirikit National Institute of Child Health', 'qsnich', 'central'),
  ('โรงพยาบาลมหาราชนครเชียงใหม่', 'Maharaj Nakorn Chiang Mai Hospital', 'maharaj-cm', 'north'),
  ('โรงพยาบาลนครพิงค์', 'Nakornping Hospital', 'nakornping', 'north'),
  ('โรงพยาบาลพุทธชินราช พิษณุโลก', 'Buddhachinaraj Phitsanulok Hospital', 'buddhachinaraj', 'north'),
  ('โรงพยาบาลศรีนครินทร์ ขอนแก่น', 'Srinagarind Hospital (Khon Kaen)', 'srinagarind', 'northeast'),
  ('โรงพยาบาลมหาราชนครราชสีมา', 'Maharat Nakhon Ratchasima Hospital', 'maharat-korat', 'northeast'),
  ('โรงพยาบาลสรรพสิทธิประสงค์ อุบลราชธานี', 'Sunpasitthiprasong Hospital (Ubon)', 'sunpasit', 'northeast'),
  ('โรงพยาบาลอุดรธานี', 'Udon Thani Hospital', 'udonthani', 'northeast'),
  ('โรงพยาบาลหาดใหญ่', 'Hatyai Hospital', 'hatyai', 'south'),
  ('โรงพยาบาลสุราษฎร์ธานี', 'Surat Thani Hospital', 'suratthani', 'south'),
  ('โรงพยาบาลวชิระภูเก็ต', 'Vachira Phuket Hospital', 'vachira-phuket', 'south'),
  ('โรงพยาบาลมหาราชนครศรีธรรมราช', 'Maharaj Nakhon Si Thammarat Hospital', 'maharaj-nst', 'south'),
  ('โรงพยาบาลชลบุรี', 'Chonburi Hospital', 'chonburi', 'east'),
  ('โรงพยาบาลระยอง', 'Rayong Hospital', 'rayong', 'east'),
  ('โรงพยาบาลพระปกเกล้า จันทบุรี', 'Phrapokklao Hospital (Chanthaburi)', 'phrapokklao', 'east'),
  ('โรงพยาบาลราชบุรี', 'Ratchaburi Hospital', 'ratchaburi', 'west'),
  ('โรงพยาบาลนครปฐม', 'Nakhon Pathom Hospital', 'nakhonpathom', 'west'),
  ('โรงพยาบาลกาญจนบุรี', 'Kanchanaburi Hospital', 'kanchanaburi', 'west'),
  ('โรงพยาบาลบำรุงราษฎร์', 'Bumrungrad International Hospital', 'bumrungrad', 'central'),
  ('โรงพยาบาลกรุงเทพ', 'Bangkok Hospital', 'bangkok-hospital', 'central'),
  ('โรงพยาบาลสมิติเวช สุขุมวิท', 'Samitivej Sukhumvit Hospital', 'samitivej', 'central'),
  ('โรงพยาบาลบีเอ็นเอช', 'BNH Hospital', 'bnh', 'central'),
  ('โรงพยาบาลเมดพาร์ค', 'MedPark Hospital', 'medpark', 'central')
on conflict (code) do nothing;

-- Create-or-get: lets the "Other" flow add a hospital without a broad
-- INSERT policy. Dedups by case-insensitive name_th.
create or replace function public.create_or_get_hospital(p_name text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_id uuid;
  v_trimmed text := btrim(p_name);
begin
  if v_trimmed = '' then
    raise exception 'hospital name required';
  end if;
  select id into v_id from public.hospitals
    where lower(name_th) = lower(v_trimmed) limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.hospitals (name_th, name_en, is_active)
    values (v_trimmed, v_trimmed, true)
    returning id into v_id;
  return v_id;
end;
$$;

-- Only authenticated users may create hospitals (not anonymous callers).
revoke execute on function public.create_or_get_hospital(text) from anon, public;
grant execute on function public.create_or_get_hospital(text) to authenticated;
