// Offline stand-in for supabase-js used only by preview.local.html: serves window.MOCK, accepts writes in memory.
window.supabase = { createClient: () => {
  const M = window.MOCK;
  const from = table => {
    const st = { rows: M[table] || [], f: [] };
    const api = {
      select: () => api, order: () => api, range: (a, b) => { st.range = [a, b]; return api; },
      eq: (c, v) => { st.f.push(r => r[c] === v); return api; }, in: (c, vs) => { st.f.push(r => vs.includes(r[c])); return api; },
      insert: w => { st.w = w; return api; }, update: w => { st.w = w; return api; }, upsert: w => { st.w = w; return api; }, delete: () => api,
      single: () => { st.one = true; return api; }, maybeSingle: () => { st.one = true; return api; },
      then: (res, rej) => {
        let rows = st.rows.filter(r => st.f.every(f => f(r)));
        if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
        let data = st.w ? [{ ...rows[0], ...st.w, id: (rows[0] && rows[0].id) || Date.now() }] : rows;
        if (st.one) data = data[0] || null;
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from, rpc: async () => ({ data: 'B-01-099', error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: null, error: { message: 'offline preview' } }) }) },
    auth: { getSession: async () => ({ data: { session: { user: M.me } } }), getUser: async () => ({ data: { user: M.me } }),
      signInWithPassword: async () => ({ error: null }), signOut: async () => ({}) } };
} };
