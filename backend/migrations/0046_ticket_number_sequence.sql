-- Ticket numbers were generated as count(*)+1, which races: two concurrent creates read the same
-- count and the second insert dies on support_tickets.ticket_number's unique constraint (a 500 for
-- the customer, not a wrong-ticket mix-up -- the constraint already prevented that). A sequence is
-- atomic, so concurrent creates simply take the next value each.
--
-- Starts after the highest number already issued so existing tickets keep their numbers. The
-- substring guard skips any row that isn't in the FI-#### shape rather than erroring on it.
do $$
declare
    next_val bigint;
begin
    select coalesce(max((substring(ticket_number from '^FI-([0-9]+)$'))::bigint), 0) + 1
      into next_val
      from support_tickets
     where ticket_number ~ '^FI-[0-9]+$';

    execute format('create sequence if not exists support_ticket_number_seq start with %s', next_val);
end $$;
