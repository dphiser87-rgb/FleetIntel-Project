-- Drivers panel rebuild: adds compliance/app-access/address fields. license_number/license_expiry
-- stay required top-level fields (load-bearing for /alerts, fleet health scoring, CSV import) —
-- the new licence columns are additive "define additional licence information" detail.

alter table drivers add column number text;
alter table drivers add column company_department text;
alter table drivers add column cell_country_code text;
alter table drivers add column private boolean not null default false;
alter table drivers add column additional_info text;
alter table drivers add column app_access jsonb not null default '{"vehicle_checklist": false}'::jsonb;
alter table drivers add column identification_method text not null default 'vehicle_assignment';
alter table drivers add column regulation text;
alter table drivers add column license_issuing_country text;
alter table drivers add column license_issuing_authority text;
alter table drivers add column license_issue_date date;
alter table drivers add column license_categories jsonb not null default '[]'::jsonb;
alter table drivers add column address_country text;
alter table drivers add column address_street text;
alter table drivers add column address_zip text;
alter table drivers add column address_city text;

alter table workspaces add column license_warning_days int not null default 30;
