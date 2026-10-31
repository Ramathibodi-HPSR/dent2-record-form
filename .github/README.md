# Dent-II record form

Online record for the Dent-II school dental trial in Bangkok (Health Policy and Systems Research, Faculty of Medicine Ramathibodi Hospital, Mahidol University).

- Static front end (`index.html`, `app.js`, `app.css`, `style.css`) served by GitHub Pages; user guide in `guide.html` (Thai).
- Data in Supabase (Singapore). `config.js` holds the project URL and the publishable key, which are public by design: row-level security in the database decides what each login may read or write.
- The system stores no personal data: children are known by study ID only.
- `supabase/migrations/` holds the schema, row-level security, audit trail and views. `scripts/` holds the API and UI tests.

This repository holds code only. Never commit child data, exports or passwords.
