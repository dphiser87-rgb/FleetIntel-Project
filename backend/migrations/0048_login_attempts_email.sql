-- 0047 keyed the throttle on IP alone, which punishes the wrong people: a whole office behind one
-- NAT'd egress IP shares a single budget, so a handful of colleagues fat-fingering passwords can
-- lock out everyone else -- including logins with correct credentials.
--
-- Adding the attempted email lets the limiter be tiered: a tight budget per (ip, email), which is
-- the actual brute-force signal, plus a much looser per-IP ceiling that still catches spraying
-- across many accounts from one source.
alter table login_attempts add column if not exists email text;

create index if not exists login_attempts_ip_email_at_idx on login_attempts (ip, email, at desc);
