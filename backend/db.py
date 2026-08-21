"""Async Postgres connection layer for Supabase.

Uses raw asyncpg (not SQLAlchemy) deliberately: SQLAlchemy's asyncpg dialect always issues a
*named* server-side PREPARE for every query — that's session-scoped state, which breaks under
pgbouncer/Supavisor *transaction*-mode pooling (needed for Vercel's serverless functions, since
each invocation is short-lived and transaction mode is what scales). asyncpg's own `fetch`/
`execute`/`executemany` use anonymous, transaction-scoped prepares instead, which pgbouncer
transaction mode handles fine. Query strings still use SQLAlchemy-style `:name` placeholders for
readability in server.py — `_translate` below converts them to asyncpg's positional `$1, $2, ...`
form before executing.
"""
import asyncio
import json
import os
import re
import uuid
from datetime import date, datetime
from decimal import Decimal

import asyncpg


def json_default(obj):
    """For manual json.dumps() calls building jsonb payloads — Postgres numeric columns decode
    to Decimal, and UUID/date/datetime values (e.g. embedded in an audit-log meta dict pulled
    straight from another row) aren't JSON-serializable by default either."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def json_dumps(obj) -> str:
    return json.dumps(obj, default=json_default)

SUPABASE_DB_URL = os.environ["SUPABASE_DB_URL"]
# asyncpg wants a plain postgres:// / postgresql:// DSN, not the SQLAlchemy-style
# "postgresql+asyncpg://" URL this project's env var historically used.
_DSN = SUPABASE_DB_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()

_PARAM_RE = re.compile(r"(?<!:):(\w+)")  # ':name' but never the second ':' of a literal '::cast'


def _translate(query: str, params: dict) -> tuple[str, list]:
    """':name' -> '$1, $2, ...', preserving Postgres '::' casts untouched. Repeated names reuse
    the same positional index (matches SQLAlchemy's text() semantics, which our call sites rely on
    for e.g. WHERE id = :id ... AND :id = ANY(...))."""
    order: list[str] = []
    index: dict[str, int] = {}

    def _sub(m: re.Match) -> str:
        name = m.group(1)
        if name not in index:
            order.append(name)
            index[name] = len(order)
        return f"${index[name]}"

    translated = _PARAM_RE.sub(_sub, query)
    args = [params[name] for name in order]
    return translated, args


async def _init_connection(conn: asyncpg.Connection) -> None:
    # Without this, jsonb columns come back as raw JSON *text*, not parsed Python objects — every
    # jsonb field (templates.sections, inspections.answers, incidents.photos, audit_log.meta,
    # user_profiles.prefs) would silently break its response shape. Encoder passes pre-serialized
    # strings through unchanged (server.py already does its own json.dumps() before the ::jsonb
    # cast) but also accepts a raw dict/list directly, so either calling style works.
    await conn.set_type_codec(
        "jsonb",
        encoder=lambda v: v if isinstance(v, str) else json.dumps(v),
        decoder=json.loads,
        schema="pg_catalog",
        format="text",
    )


async def _get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        async with _pool_lock:
            if _pool is None:
                _pool = await asyncpg.create_pool(
                    _DSN, min_size=1, max_size=5, statement_cache_size=0, init=_init_connection
                )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def _with_retry(coro_fn, attempts: int = 3, base_delay: float = 1.0):
    """Retries on transient connection loss — this network has been dropping connections
    mid-query under load; a dead connection is only caught by asyncpg's own pool health checks
    on the *next* acquire, not one that dies while a query is already in flight."""
    last_exc = None
    for i in range(attempts):
        try:
            return await coro_fn()
        except (asyncpg.PostgresConnectionError, OSError, ConnectionError) as e:
            last_exc = e
            if i < attempts - 1:
                await asyncio.sleep(base_delay * (i + 1))
    raise last_exc


async def fetch_one(query: str, **params) -> dict | None:
    async def _do():
        pool = await _get_pool()
        sql, args = _translate(query, params)
        row = await pool.fetchrow(sql, *args)
        return dict(row) if row else None
    return await _with_retry(_do)


async def fetch_all(query: str, **params) -> list[dict]:
    async def _do():
        pool = await _get_pool()
        sql, args = _translate(query, params)
        rows = await pool.fetch(sql, *args)
        return [dict(r) for r in rows]
    return await _with_retry(_do)


async def execute(query: str, **params) -> None:
    async def _do():
        pool = await _get_pool()
        sql, args = _translate(query, params)
        await pool.execute(sql, *args)
    await _with_retry(_do)


async def execute_many(query: str, rows: list[dict]) -> None:
    if not rows:
        return
    order = _PARAM_RE.findall(query)
    seen = list(dict.fromkeys(order))  # de-duped, first-occurrence order — matches _translate
    sql, _ = _translate(query, rows[0])
    arg_rows = [[r[name] for name in seen] for r in rows]

    async def _do():
        pool = await _get_pool()
        await pool.executemany(sql, arg_rows)
    await _with_retry(_do)


async def update_row(table: str, row_id: str, workspace_id: str, patch: dict, allowed_cols: set) -> None:
    """Partial update from an untrusted client dict — allowed_cols guards against arbitrary column
    injection (client-supplied keys can't be parameterized as SQL identifiers, only as values)."""
    patch = {k: v for k, v in patch.items() if k in allowed_cols}
    if not patch:
        return
    set_parts, params = [], {"id": row_id, "ws": workspace_id}
    for k, v in patch.items():
        if isinstance(v, (list, dict)):
            set_parts.append(f"{k} = :{k} ::jsonb")
            params[k] = json_dumps(v)
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v
    await execute(f"update {table} set {', '.join(set_parts)} where id = :id and workspace_id = :ws", **params)
