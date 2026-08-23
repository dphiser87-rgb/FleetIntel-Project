-- Workshop/Operations/Finance manager-vs-staff role tiers, plus a label-only account type for admins.
alter table user_profiles add column account_type text;
