-- ============================================================
-- TRACQUE — Off-market outreach plumbing
-- ============================================================
-- County records carry the owner's MAILING ADDRESS — the free, reliable
-- contact channel for off-market/absentee owners (direct mail has no
-- TCPA problem). Store it on properties and leads so sweeps can feed
-- letters and skip-trace.

alter table properties add column if not exists owner_mail_address text;
alter table leads      add column if not exists owner_mail_address text;
