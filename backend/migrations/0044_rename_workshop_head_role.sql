-- Renames the "workshop_head" role identifier to "workshop_manager" everywhere it's stored as data --
-- the codebase's own comments/error messages already called this role "Workshop Manager" informally
-- (e.g. "Only an ops manager, workshop manager, or technician..."), so this brings the actual role
-- value in line with what everyone already calls it. Backend/frontend/mobile source references were
-- updated in the same change; this migration only touches existing rows.
update user_profiles set role = 'workshop_manager' where role = 'workshop_head';
update invites set role = 'workshop_manager' where role = 'workshop_head';
update workspaces set costing_approver_role = 'workshop_manager' where costing_approver_role = 'workshop_head';
