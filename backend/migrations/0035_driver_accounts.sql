-- Lets a `drivers` roster row (license/vehicle-assignment record, no login capability) become a real
-- login account: phone as an alternate login identifier, driver_id linking the account back to its
-- roster record so the mobile app can resolve "this logged-in user is this driver" and pull their
-- assigned_vehicle_id. Both nullable -- most user_profiles rows (office/admin staff) will never set
-- either.
alter table user_profiles add column phone text;
alter table user_profiles add column driver_id uuid references drivers(id);
create index user_profiles_phone_idx on user_profiles(phone) where phone is not null;
create index user_profiles_driver_id_idx on user_profiles(driver_id) where driver_id is not null;
