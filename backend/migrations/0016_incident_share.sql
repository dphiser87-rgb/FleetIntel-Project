-- Public read-only share links for incidents, mirroring vehicles.share_token — lets a workspace user
-- hand an insurance adjuster a link to view and download the incident (photos, PDF) without a login.
alter table incidents add column share_token text unique;
alter table incidents add column share_created_at timestamptz;
