"""Every table in the public schema must have row-level security enabled.

Supabase exposes the public schema through PostgREST to anyone holding the project's anon key, and a
table without RLS is readable and writable by that key under the default grants. The backend talks
to Postgres directly and bypasses RLS, so a missing `enable row level security` never shows up as a
broken feature -- only as a security-advisor alert after it ships. That is how login_attempts went
out without it (fixed in 0051). This turns that alert into a failing test instead.

Read-only; needs SUPABASE_DB_URL (backend/.env).
"""
import asyncio
import os
from pathlib import Path

import asyncpg
import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

pytestmark = pytest.mark.skipif(not os.environ.get("SUPABASE_DB_URL"), reason="needs SUPABASE_DB_URL")


def test_every_public_table_has_row_level_security():
    async def unprotected():
        conn = await asyncpg.connect(os.environ["SUPABASE_DB_URL"], ssl="require", statement_cache_size=0)
        try:
            return [r["relname"] for r in await conn.fetch(
                "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                "where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity "
                "order by c.relname")]
        finally:
            await conn.close()

    missing = asyncio.run(unprotected())
    assert not missing, (
        f"Row-level security is off for: {', '.join(missing)}. Add "
        f"`alter table <name> enable row level security;` to the migration that creates it."
    )
