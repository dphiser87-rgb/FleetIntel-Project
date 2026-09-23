-- Account lockout shipped defaulting to false (0027), so every workspace created since then has had
-- it off unless an admin went looking for the setting. Now that IP+account rate limiting covers
-- brute force at the edge, lockout is defence-in-depth and a sensible default for new tenants.
--
-- Deliberately only changes the DEFAULT for workspaces created from here on. Existing workspaces
-- keep whatever they have: flipping it on underneath live tenants would start locking out real
-- users mid-flight for behaviour that was permitted a minute earlier.
alter table workspaces alter column lockout_enabled set default true;
