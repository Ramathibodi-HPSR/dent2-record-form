// Public settings for the front end. The URL and the publishable (anon) key are public by design:
// row-level security in the database decides what each login can read or write.
window.DENT2_CONFIG = {
  url: 'https://txamfktfepeoomquqkbe.supabase.co',
  anonKey: 'sb_publishable_nZKkeh6S-h1FQsIX3_TatQ_zMjcyJiK',   // publishable key (public)
  loginDomain: 'dent2.test',   // "public-cap" signs in as public-cap@dent2.test (test accounts only)
};
