-- Lets a workspace with no dedicated Workshop Manager designate another role (Operations Manager or
-- Finance) as the costing approver instead. NULL means no override -- default System Rights apply.
alter table workspaces add column costing_approver_role text;
