from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import re
import ipaddress
import secrets
import asyncio
import logging
import uuid
import bcrypt
import jwt
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Mongo ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# --- JWT helpers ---
JWT_ALGO = "HS256"
DEFAULT_WORKSPACE_ID = "default"
def jwt_secret(): return os.environ["JWT_SECRET"]

# --- Email guardrails & sender (Resend playbook) ---
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host: return False
    try:
        ipaddress.ip_address(host); return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href"); self._text = []
    def handle_data(self, data):
        if self._href is not None: self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text))); self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body: raise ValueError(f"Credential ask: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")): continue
        if not low.startswith("https://"):
            raise ValueError(f"Non-https link/src: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Bad host: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real: continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor mismatch {m.group(1)!r} != {real!r} (G3)")

async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    key = os.environ.get("EMERGENT_EMAIL_KEY")
    from_name = os.environ.get("EMAIL_FROM_NAME", "FleetCost Intelligence")
    if not key:
        logger.warning("EMERGENT_EMAIL_KEY not set — skipping email")
        return None
    payload = {"to": [to], "subject": subject, "html": html, "from_name": from_name}
    reply_to = os.environ.get("EMAIL_REPLY_TO")
    if reply_to: payload["contact_email"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": key}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return None

def ws_filter(user: dict, extra: dict = None) -> dict:
    q = {"workspace_id": user.get("workspace_id", DEFAULT_WORKSPACE_ID)}
    if extra: q.update(extra)
    return q

async def log_event(user: dict, action: str, entity_type: str, entity_id: str = "", meta: dict = None):
    """Record an audit event for the workspace."""
    try:
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "workspace_id": user.get("workspace_id", DEFAULT_WORKSPACE_ID),
            "user_id": user.get("id", ""),
            "user_name": user.get("name", ""),
            "user_email": user.get("email", ""),
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "meta": meta or {},
            "at": now_iso(),
        })
    except Exception as e:
        logger.error(f"audit log failed: {e}")

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGO)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dep

# --- Models ---
class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Optional[Literal["admin", "manager", "inspector", "mechanic"]] = "manager"
    invite_code: Optional[str] = None
    workspace_name: Optional[str] = None

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class VehicleIn(BaseModel):
    name: str
    plate: str
    make: str
    model: str
    year: int
    type: Literal["truck", "van", "car", "bus", "trailer"] = "truck"
    status: Literal["active", "maintenance", "idle"] = "active"
    odometer: float = 0
    fuel_cost_per_km: float = 0.35
    image_url: Optional[str] = None

class ChecklistItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    type: Literal["boolean", "rating", "text", "number"] = "boolean"
    required: bool = True

class ChecklistSection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    items: List[ChecklistItem] = []

class TemplateIn(BaseModel):
    name: str
    description: Optional[str] = ""
    sections: List[ChecklistSection] = []

class InspectionAnswer(BaseModel):
    item_id: str
    value: str  # "pass", "fail", rating number, text
    note: Optional[str] = ""
    photo: Optional[str] = None  # base64 data URL

class PartIn(BaseModel):
    name: str
    sku: str
    category: Optional[str] = "general"
    stock: int = 0
    reorder_point: int = 5
    unit_cost: float = 0
    supplier: Optional[str] = ""
    supplier_email: Optional[str] = ""

class PartAdjust(BaseModel):
    delta: int  # +add stock, -consume
    reason: Optional[str] = ""

class InviteIn(BaseModel):
    email: EmailStr
    role: Literal["manager", "inspector", "mechanic", "admin"] = "manager"

class WorkspaceRename(BaseModel):
    name: str

class OCRIn(BaseModel):
    image_base64: str  # data URL or raw base64
    mode: Literal["plate", "odometer"] = "plate"

class InspectionIn(BaseModel):
    template_id: str
    vehicle_id: str
    answers: List[InspectionAnswer] = []
    notes: Optional[str] = ""
    odometer: Optional[float] = None

class MaintenanceIn(BaseModel):
    vehicle_id: str
    inspection_id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    estimated_cost: float = 0
    estimated_hours: float = 0
    assigned_to: Optional[str] = None  # mechanic user id
    parts_cost: float = 0
    labor_cost: float = 0

class MaintenanceUpdate(BaseModel):
    status: Optional[Literal["pending", "in_progress", "completed", "cancelled"]] = None
    actual_cost: Optional[float] = None
    parts_cost: Optional[float] = None
    labor_cost: Optional[float] = None
    downtime_hours: Optional[float] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None

# --- App ---
app = FastAPI(title="FleetCost Intelligence API")
api = APIRouter(prefix="/api")

def now_iso(): return datetime.now(timezone.utc).isoformat()

# --- Auth routes ---
@api.post("/auth/register")
async def register(req: RegisterReq):
    email = req.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    # Resolve workspace via invite or new workspace
    workspace_id = None
    role = req.role
    if req.invite_code:
        invite = await db.invites.find_one({"code": req.invite_code, "used_by": None})
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid or used invite code")
        if invite.get("email") and invite["email"].lower() != email:
            raise HTTPException(status_code=400, detail="Invite email mismatch")
        workspace_id = invite["workspace_id"]
        role = invite.get("role", role)
    else:
        # Create a new workspace for this user
        workspace_id = str(uuid.uuid4())
        await db.workspaces.insert_one({
            "id": workspace_id, "name": req.workspace_name or f"{req.name}'s Fleet",
            "owner_email": email, "created_at": now_iso(),
        })

    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": req.name,
        "role": role,
        "workspace_id": workspace_id,
        "password_hash": hash_pw(req.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)

    if req.invite_code:
        await db.invites.update_one({"code": req.invite_code}, {"$set": {"used_by": user["id"], "used_at": now_iso()}})
        await log_event(user, "invite.accepted", "user", user["id"], {"email": user["email"], "role": user["role"]})

    token = create_access_token(user["id"], user["email"], user["role"])
    user.pop("password_hash", None); user.pop("_id", None)
    return {"user": user, "token": token}

@api.post("/auth/login")
async def login(req: LoginReq):
    email = req.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["id"], user["email"], user["role"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "token": token}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}

@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find(ws_filter(user), {"_id": 0, "password_hash": 0}).to_list(500)
    return users

# --- Vehicles ---
@api.get("/vehicles")
async def list_vehicles(user: dict = Depends(get_current_user)):
    return await db.vehicles.find(ws_filter(user), {"_id": 0}).to_list(1000)

@api.post("/vehicles")
async def create_vehicle(v: VehicleIn, user: dict = Depends(get_current_user)):
    doc = v.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["workspace_id"] = user["workspace_id"]
    doc["created_at"] = now_iso()
    await db.vehicles.insert_one(doc)
    await log_event(user, "vehicle.created", "vehicle", doc["id"], {"name": doc["name"], "plate": doc["plate"]})
    doc.pop("_id", None)
    return doc

@api.get("/vehicles/{vid}")
async def get_vehicle(vid: str, user: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one(ws_filter(user, {"id": vid}), {"_id": 0})
    if not v: raise HTTPException(status_code=404, detail="Not found")
    return v

@api.patch("/vehicles/{vid}")
async def update_vehicle(vid: str, patch: dict, user: dict = Depends(get_current_user)):
    patch.pop("id", None); patch.pop("_id", None); patch.pop("workspace_id", None)
    await db.vehicles.update_one(ws_filter(user, {"id": vid}), {"$set": patch})
    return await db.vehicles.find_one(ws_filter(user, {"id": vid}), {"_id": 0})

@api.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user: dict = Depends(get_current_user)):
    await db.vehicles.delete_one(ws_filter(user, {"id": vid}))
    return {"ok": True}

# --- Templates ---
@api.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    return await db.templates.find(ws_filter(user), {"_id": 0}).to_list(200)

@api.post("/templates")
async def create_template(t: TemplateIn, user: dict = Depends(get_current_user)):
    doc = t.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["workspace_id"] = user["workspace_id"]
    doc["created_by"] = user["id"]
    doc["created_at"] = now_iso()
    await db.templates.insert_one(doc)
    await log_event(user, "template.created", "template", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return doc

@api.get("/templates/{tid}")
async def get_template(tid: str, user: dict = Depends(get_current_user)):
    t = await db.templates.find_one(ws_filter(user, {"id": tid}), {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Not found")
    return t

@api.patch("/templates/{tid}")
async def update_template(tid: str, patch: dict, user: dict = Depends(get_current_user)):
    patch.pop("id", None); patch.pop("_id", None); patch.pop("workspace_id", None)
    await db.templates.update_one(ws_filter(user, {"id": tid}), {"$set": patch})
    return await db.templates.find_one(ws_filter(user, {"id": tid}), {"_id": 0})

@api.delete("/templates/{tid}")
async def delete_template(tid: str, user: dict = Depends(get_current_user)):
    await db.templates.delete_one(ws_filter(user, {"id": tid}))
    return {"ok": True}

# --- Inspections ---
@api.get("/inspections")
async def list_inspections(vehicle_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = ws_filter(user, {"vehicle_id": vehicle_id} if vehicle_id else {})
    return await db.inspections.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.post("/inspections")
async def create_inspection(i: InspectionIn, user: dict = Depends(get_current_user)):
    doc = i.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["inspector_id"] = user["id"]
    doc["inspector_name"] = user["name"]
    doc["created_at"] = now_iso()
    # count fails
    fails = sum(1 for a in doc.get("answers", []) if str(a.get("value","")).lower() == "fail")
    doc["fail_count"] = fails
    doc["status"] = "completed"
    if doc.get("odometer"):
        await db.vehicles.update_one({"id": doc["vehicle_id"]}, {"$set": {"odometer": doc["odometer"]}})
    await db.inspections.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/inspections/{iid}")
async def get_inspection(iid: str, user: dict = Depends(get_current_user)):
    x = await db.inspections.find_one({"id": iid}, {"_id": 0})
    if not x: raise HTTPException(status_code=404, detail="Not found")
    return x

# --- Maintenance jobs ---
@api.get("/maintenance")
async def list_maintenance(user: dict = Depends(get_current_user)):
    return await db.maintenance.find(ws_filter(user), {"_id": 0}).sort("created_at", -1).to_list(500)

@api.post("/maintenance")
async def create_maintenance(m: MaintenanceIn, user: dict = Depends(get_current_user)):
    doc = m.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["workspace_id"] = user["workspace_id"]
    doc["status"] = "pending"
    doc["created_by"] = user["id"]
    doc["created_at"] = now_iso()
    doc["actual_cost"] = 0
    doc["downtime_hours"] = 0
    await db.maintenance.insert_one(doc)
    await db.vehicles.update_one(ws_filter(user, {"id": doc["vehicle_id"]}), {"$set": {"status": "maintenance"}})
    await log_event(user, "maintenance.created", "maintenance", doc["id"], {"title": doc["title"], "priority": doc["priority"]})
    doc.pop("_id", None)
    return doc

@api.patch("/maintenance/{mid}")
async def update_maintenance(mid: str, patch: MaintenanceUpdate, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in patch.model_dump().items() if v is not None}
    job = await db.maintenance.find_one(ws_filter(user, {"id": mid}))
    if not job: raise HTTPException(status_code=404, detail="Not found")
    if upd.get("status") == "completed":
        upd["completed_at"] = now_iso()
        pc = upd.get("parts_cost", job.get("parts_cost", 0))
        lc = upd.get("labor_cost", job.get("labor_cost", 0))
        upd["actual_cost"] = upd.get("actual_cost") or (pc + lc)
        await db.vehicles.update_one(ws_filter(user, {"id": job["vehicle_id"]}), {"$set": {"status": "active"}})
    if upd.get("status") == "in_progress":
        upd["started_at"] = now_iso()
    await db.maintenance.update_one(ws_filter(user, {"id": mid}), {"$set": upd})
    if upd.get("status"):
        await log_event(user, f"maintenance.{upd['status']}", "maintenance", mid, {"title": job.get("title", ""), "actual_cost": upd.get("actual_cost")})
    return await db.maintenance.find_one(ws_filter(user, {"id": mid}), {"_id": 0})

@api.delete("/maintenance/{mid}")
async def delete_maintenance(mid: str, user: dict = Depends(get_current_user)):
    await db.maintenance.delete_one(ws_filter(user, {"id": mid}))
    return {"ok": True}

# --- KPIs / Analytics ---
@api.get("/analytics/kpi")
async def analytics_kpi(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find(ws_filter(user), {"_id": 0}).to_list(1000)
    maint = await db.maintenance.find(ws_filter(user), {"_id": 0}).to_list(2000)
    total_vehicles = len(vehicles)
    active = sum(1 for v in vehicles if v.get("status") == "active")
    in_maint = sum(1 for v in vehicles if v.get("status") == "maintenance")
    idle = sum(1 for v in vehicles if v.get("status") == "idle")
    completed_jobs = [m for m in maint if m.get("status") == "completed"]
    pending_jobs = [m for m in maint if m.get("status") in ("pending", "in_progress")]
    total_maint_cost = sum(m.get("actual_cost", 0) or 0 for m in completed_jobs)
    total_labor = sum(m.get("labor_cost", 0) or 0 for m in completed_jobs)
    total_parts = sum(m.get("parts_cost", 0) or 0 for m in completed_jobs)
    total_downtime = sum(m.get("downtime_hours", 0) or 0 for m in completed_jobs)
    total_odo = sum(v.get("odometer", 0) or 0 for v in vehicles)
    total_fuel_cost = sum((v.get("odometer", 0) or 0) * (v.get("fuel_cost_per_km", 0) or 0) for v in vehicles)
    cost_per_vehicle = (total_maint_cost / total_vehicles) if total_vehicles else 0
    utilization = (active / total_vehicles * 100) if total_vehicles else 0
    return {
        "total_vehicles": total_vehicles,
        "active": active,
        "in_maintenance": in_maint,
        "idle": idle,
        "utilization_pct": round(utilization, 1),
        "total_maintenance_cost": round(total_maint_cost, 2),
        "total_labor_cost": round(total_labor, 2),
        "total_parts_cost": round(total_parts, 2),
        "total_fuel_cost": round(total_fuel_cost, 2),
        "total_downtime_hours": round(total_downtime, 1),
        "cost_per_vehicle": round(cost_per_vehicle, 2),
        "pending_jobs": len(pending_jobs),
        "completed_jobs": len(completed_jobs),
        "total_km": round(total_odo, 0),
    }

@api.get("/analytics/cost-trend")
async def cost_trend(user: dict = Depends(get_current_user)):
    maint = await db.maintenance.find({"status": "completed"}, {"_id": 0}).to_list(2000)
    buckets = {}
    for m in maint:
        d = m.get("completed_at") or m.get("created_at") or now_iso()
        month = d[:7]
        buckets.setdefault(month, {"month": month, "parts": 0, "labor": 0, "total": 0})
        buckets[month]["parts"] += m.get("parts_cost", 0) or 0
        buckets[month]["labor"] += m.get("labor_cost", 0) or 0
        buckets[month]["total"] += m.get("actual_cost", 0) or 0
    return sorted(buckets.values(), key=lambda x: x["month"])

@api.get("/analytics/cost-by-category")
async def cost_by_category(user: dict = Depends(get_current_user)):
    maint = await db.maintenance.find(ws_filter(user, {"status": "completed"}), {"_id": 0}).to_list(2000)
    total_parts = sum(m.get("parts_cost", 0) or 0 for m in maint)
    total_labor = sum(m.get("labor_cost", 0) or 0 for m in maint)
    vehicles = await db.vehicles.find(ws_filter(user), {"_id": 0}).to_list(1000)
    total_fuel = sum((v.get("odometer", 0) or 0) * (v.get("fuel_cost_per_km", 0) or 0) for v in vehicles)
    return [
        {"name": "Parts", "value": round(total_parts, 2)},
        {"name": "Labor", "value": round(total_labor, 2)},
        {"name": "Fuel", "value": round(total_fuel, 2)},
    ]

@api.get("/analytics/vehicle-cost")
async def vehicle_cost(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find(ws_filter(user), {"_id": 0}).to_list(1000)
    maint = await db.maintenance.find(ws_filter(user, {"status": "completed"}), {"_id": 0}).to_list(2000)
    result = []
    for v in vehicles:
        cost = sum(m.get("actual_cost", 0) or 0 for m in maint if m.get("vehicle_id") == v["id"])
        result.append({"vehicle": v["name"], "plate": v["plate"], "cost": round(cost, 2)})
    return sorted(result, key=lambda x: x["cost"], reverse=True)

# --- Parts inventory ---
@api.get("/parts")
async def list_parts(user: dict = Depends(get_current_user)):
    return await db.parts.find(ws_filter(user), {"_id": 0}).sort("name", 1).to_list(1000)

@api.get("/parts/alerts")
async def part_alerts(user: dict = Depends(get_current_user)):
    parts = await db.parts.find(ws_filter(user), {"_id": 0}).to_list(1000)
    return [p for p in parts if (p.get("stock", 0) or 0) <= (p.get("reorder_point", 0) or 0)]

@api.post("/parts")
async def create_part(p: PartIn, user: dict = Depends(get_current_user)):
    doc = p.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["workspace_id"] = user["workspace_id"]
    doc["created_at"] = now_iso()
    await db.parts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/parts/{pid}")
async def update_part(pid: str, patch: dict, user: dict = Depends(get_current_user)):
    patch.pop("id", None); patch.pop("_id", None); patch.pop("workspace_id", None)
    await db.parts.update_one(ws_filter(user, {"id": pid}), {"$set": patch})
    return await db.parts.find_one(ws_filter(user, {"id": pid}), {"_id": 0})

async def _maybe_reorder_email(part: dict, workspace_id: str) -> Optional[str]:
    """Send supplier reorder email if part is at/below reorder point and has an email."""
    if not part.get("supplier_email"): return None
    if (part.get("stock", 0) or 0) > (part.get("reorder_point", 0) or 0): return None
    # Prevent duplicate emails within 24h
    key = f"reorder:{workspace_id}:{part['id']}"
    recent = await db.email_log.find_one({"key": key})
    if recent and (datetime.now(timezone.utc) - datetime.fromisoformat(recent["at"])).total_seconds() < 86400:
        return None
    ws = await db.workspaces.find_one({"id": workspace_id}) or {"name": "FleetCost"}
    from_name = os.environ.get("EMAIL_FROM_NAME", "FleetCost Intelligence")
    subject = f"Reorder request: {part['name']} (SKU {part['sku']})"
    html = (
        f'<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:#0f172a">'
        f'<tr><td style="padding:24px;border-bottom:2px solid #FF3B30">'
        f'<div style="font-size:12px;letter-spacing:0.2em;color:#64748b;text-transform:uppercase">{escape(from_name)}</div>'
        f'<h1 style="margin:8px 0 0 0;font-size:22px">Automated reorder request</h1></td></tr>'
        f'<tr><td style="padding:24px">'
        f'<p style="margin:0 0 16px 0">Hello,</p>'
        f'<p style="margin:0 0 16px 0"><strong>{escape(ws.get("name", "FleetCost"))}</strong> would like to reorder the following part which has fallen below the reorder threshold:</p>'
        f'<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0">'
        f'<tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Part</td><td style="padding:8px;background:#f8fafc">{escape(part["name"])}</td></tr>'
        f'<tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">SKU</td><td style="padding:8px;background:#f8fafc">{escape(part["sku"])}</td></tr>'
        f'<tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Current stock</td><td style="padding:8px;background:#f8fafc">{part.get("stock", 0)}</td></tr>'
        f'<tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Reorder point</td><td style="padding:8px;background:#f8fafc">{part.get("reorder_point", 0)}</td></tr>'
        f'<tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Supplier</td><td style="padding:8px;background:#f8fafc">{escape(part.get("supplier", "") or "—")}</td></tr>'
        f'</table>'
        f'<p style="margin:16px 0 0 0">Please confirm availability and expected delivery. Reply to this email to coordinate.</p>'
        f'<p style="margin:24px 0 0 0;font-size:12px;color:#888">Sent by {escape(from_name)}. We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )
    email_id = await send_email(to=part["supplier_email"], subject=subject, html=html)
    await db.email_log.update_one({"key": key}, {"$set": {"key": key, "at": now_iso(), "email_id": email_id}}, upsert=True)
    return email_id

@api.post("/parts/{pid}/adjust")
async def adjust_part(pid: str, adj: PartAdjust, user: dict = Depends(get_current_user)):
    part = await db.parts.find_one(ws_filter(user, {"id": pid}))
    if not part: raise HTTPException(status_code=404, detail="Not found")
    was_above = (part.get("stock", 0) or 0) > (part.get("reorder_point", 0) or 0)
    new_stock = max(0, (part.get("stock", 0) or 0) + adj.delta)
    await db.parts.update_one(ws_filter(user, {"id": pid}), {"$set": {"stock": new_stock}})
    await db.parts_history.insert_one({
        "id": str(uuid.uuid4()), "workspace_id": user["workspace_id"], "part_id": pid,
        "delta": adj.delta, "reason": adj.reason or "", "by": user["id"], "at": now_iso()
    })
    updated = await db.parts.find_one(ws_filter(user, {"id": pid}), {"_id": 0})
    await log_event(user, "part.adjusted", "part", pid, {"name": part.get("name"), "delta": adj.delta, "new_stock": new_stock})
    # Trigger auto-reorder email if we JUST crossed below threshold
    is_below = new_stock <= (part.get("reorder_point", 0) or 0)
    if was_above and is_below:
        asyncio.create_task(_maybe_reorder_email(updated, user["workspace_id"]))
    return updated

@api.delete("/parts/{pid}")
async def delete_part(pid: str, user: dict = Depends(get_current_user)):
    await db.parts.delete_one(ws_filter(user, {"id": pid}))
    return {"ok": True}

# --- Audit log ---
@api.get("/audit")
async def audit_list(limit: int = 200, user: dict = Depends(get_current_user)):
    events = await db.audit_log.find(ws_filter(user), {"_id": 0}).sort("at", -1).to_list(limit)
    return events

# --- CSV export ---
def _csv_response(rows: list, header: list, filename: str) -> StreamingResponse:
    import csv
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(header)
    for r in rows:
        writer.writerow([r.get(h, "") for h in header])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"})

def _csv_export_dep(request: Request):
    """Auth dependency that accepts ?token= for direct download links."""
    return None

@api.get("/export/maintenance.csv")
async def export_maintenance(request: Request):
    token = request.query_params.get("token")
    if token:
        try:
            payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGO])
            user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
            if not user: raise HTTPException(status_code=401, detail="User not found")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        user = await get_current_user(request)
    jobs = await db.maintenance.find(ws_filter(user), {"_id": 0}).sort("created_at", -1).to_list(5000)
    vehicles = {v["id"]: v for v in await db.vehicles.find(ws_filter(user), {"_id": 0}).to_list(1000)}
    rows = []
    for j in jobs:
        v = vehicles.get(j.get("vehicle_id"), {})
        rows.append({
            "job_id": j.get("id", ""), "created_at": j.get("created_at", ""),
            "completed_at": j.get("completed_at", ""), "vehicle": v.get("name", ""),
            "plate": v.get("plate", ""), "title": j.get("title", ""),
            "priority": j.get("priority", ""), "status": j.get("status", ""),
            "parts_cost": j.get("parts_cost", 0), "labor_cost": j.get("labor_cost", 0),
            "actual_cost": j.get("actual_cost", 0), "estimated_cost": j.get("estimated_cost", 0),
            "downtime_hours": j.get("downtime_hours", 0),
        })
    return _csv_response(rows, ["job_id","created_at","completed_at","vehicle","plate","title","priority","status","parts_cost","labor_cost","actual_cost","estimated_cost","downtime_hours"], "maintenance-ledger.csv")

@api.get("/export/parts.csv")
async def export_parts(request: Request):
    token = request.query_params.get("token")
    if token:
        try:
            payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGO])
            user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
            if not user: raise HTTPException(status_code=401, detail="User not found")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        user = await get_current_user(request)
    parts = await db.parts.find(ws_filter(user), {"_id": 0}).sort("name", 1).to_list(5000)
    rows = []
    for p in parts:
        stock = p.get("stock", 0) or 0
        unit = p.get("unit_cost", 0) or 0
        rows.append({
            "sku": p.get("sku", ""), "name": p.get("name", ""),
            "category": p.get("category", ""), "supplier": p.get("supplier", ""),
            "supplier_email": p.get("supplier_email", ""),
            "stock": stock, "reorder_point": p.get("reorder_point", 0),
            "unit_cost": unit, "inventory_value": round(stock * unit, 2),
            "low_stock": "yes" if stock <= (p.get("reorder_point", 0) or 0) else "no",
        })
    return _csv_response(rows, ["sku","name","category","supplier","supplier_email","stock","reorder_point","unit_cost","inventory_value","low_stock"], "parts-inventory.csv")

# --- Workspace / Team / Invites ---
@api.get("/workspace")
async def get_workspace(user: dict = Depends(get_current_user)):
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    if not ws:
        ws = {"id": user["workspace_id"], "name": "FleetCost Workspace"}
    users = await db.users.find({"workspace_id": user["workspace_id"]}, {"_id": 0, "password_hash": 0}).to_list(200)
    invites = await db.invites.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"workspace": ws, "members": users, "invites": invites}

@api.patch("/workspace")
async def rename_workspace(req: WorkspaceRename, user: dict = Depends(get_current_user)):
    await db.workspaces.update_one({"id": user["workspace_id"]}, {"$set": {"name": req.name}})
    return await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})

@api.post("/workspace/invites")
async def create_invite(req: InviteIn, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admins/managers can invite")
    if await db.users.find_one({"email": req.email.lower(), "workspace_id": user["workspace_id"]}):
        raise HTTPException(status_code=400, detail="User already a member")
    code = secrets.token_urlsafe(12)
    doc = {
        "id": str(uuid.uuid4()), "workspace_id": user["workspace_id"], "code": code,
        "email": req.email.lower(), "role": req.role, "created_by": user["id"],
        "created_at": now_iso(), "used_by": None, "used_at": None,
    }
    await db.invites.insert_one(doc)
    await log_event(user, "invite.created", "invite", doc["id"], {"email": req.email, "role": req.role})
    doc.pop("_id", None)
    return doc

@api.delete("/workspace/invites/{iid}")
async def revoke_invite(iid: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.invites.delete_one({"id": iid, "workspace_id": user["workspace_id"]})
    return {"ok": True}

# --- OCR (Camera OCR) ---
@api.post("/ocr")
async def ocr_image(req: OCRIn, user: dict = Depends(get_current_user)):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="LLM key not configured")
    raw = req.image_base64
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[-1]
    prompt = (
        "Extract only the license plate number from this photo. Return just the plate string, no other text."
        if req.mode == "plate" else
        "Extract only the odometer reading (numeric km/mi) from this photo. Return just the integer, no units, no other text."
    )
    try:
        chat = LlmChat(api_key=key, session_id=f"ocr-{user['id']}-{uuid.uuid4().hex[:6]}",
                       system_message="You are an OCR assistant. Reply with only the requested value, nothing else.").with_model("openai", "gpt-4o-mini")
        img = ImageContent(image_base64=raw)
        result = await chat.send_message(UserMessage(text=prompt, file_contents=[img]))
        text = (result or "").strip().strip('"').strip("'")
        if req.mode == "odometer":
            digits = "".join(ch for ch in text if ch.isdigit())
            return {"value": digits or text, "raw": text}
        return {"value": text, "raw": text}
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        raise HTTPException(status_code=502, detail=f"OCR failed: {str(e)[:100]}")

# --- Cost anomaly detection ---
@api.get("/analytics/anomalies")
async def anomalies(user: dict = Depends(get_current_user)):
    """Detect vehicles whose most recent month's spend is > mean + 1.5*std of their history."""
    vehicles = await db.vehicles.find(ws_filter(user), {"_id": 0}).to_list(1000)
    maint = await db.maintenance.find(ws_filter(user, {"status": "completed"}), {"_id": 0}).to_list(2000)
    out = []
    for v in vehicles:
        by_month = {}
        for m in maint:
            if m.get("vehicle_id") != v["id"]: continue
            d = m.get("completed_at") or m.get("created_at") or ""
            mo = d[:7]
            if not mo: continue
            by_month[mo] = by_month.get(mo, 0) + (m.get("actual_cost", 0) or 0)
        if len(by_month) < 3: continue
        series = sorted(by_month.items())
        vals = [s[1] for s in series]
        latest_month, latest_val = series[-1]
        history = vals[:-1]
        mean = sum(history) / len(history)
        var = sum((x - mean) ** 2 for x in history) / len(history)
        std = var ** 0.5
        threshold = mean + 1.5 * std
        if std > 0 and latest_val > threshold:
            out.append({
                "vehicle_id": v["id"], "vehicle": v["name"], "plate": v["plate"],
                "month": latest_month, "spend": round(latest_val, 2),
                "mean": round(mean, 2), "threshold": round(threshold, 2),
                "delta_pct": round((latest_val - mean) / mean * 100 if mean else 0, 1),
            })
    return sorted(out, key=lambda x: x["delta_pct"], reverse=True)

# --- Forecast ---
@api.get("/analytics/forecast")
async def forecast(user: dict = Depends(get_current_user)):
    """Linear-regression forecast of maintenance cost for next 3 months."""
    maint = await db.maintenance.find(ws_filter(user, {"status": "completed"}), {"_id": 0}).to_list(2000)
    buckets = {}
    for m in maint:
        d = m.get("completed_at") or m.get("created_at") or now_iso()
        month = d[:7]
        buckets[month] = buckets.get(month, 0) + (m.get("actual_cost", 0) or 0)
    history = sorted(buckets.items(), key=lambda x: x[0])
    if len(history) < 2:
        return {"history": [{"month": m, "total": t, "type": "actual"} for m, t in history], "forecast": []}
    n = len(history)
    xs = list(range(n))
    ys = [h[1] for h in history]
    mx = sum(xs) / n; my = sum(ys) / n
    denom = sum((x - mx) ** 2 for x in xs) or 1
    slope = sum((xs[i] - mx) * (ys[i] - my) for i in range(n)) / denom
    intercept = my - slope * mx
    # forecast next 3 months
    last_month = datetime.strptime(history[-1][0] + "-01", "%Y-%m-%d")
    out_hist = [{"month": m, "total": round(t, 2), "type": "actual"} for m, t in history]
    out_fore = []
    for i in range(1, 4):
        nm = (last_month.replace(day=1) + timedelta(days=32 * i)).replace(day=1)
        key = nm.strftime("%Y-%m")
        pred = max(0, intercept + slope * (n - 1 + i))
        out_fore.append({"month": key, "total": round(pred, 2), "type": "forecast"})
    return {"history": out_hist, "forecast": out_fore}

# --- PDF export ---
@api.get("/inspections/{iid}/pdf")
async def inspection_pdf(iid: str, request: Request):
    # Accept token via query param for direct download links
    token = request.query_params.get("token") or None
    if token:
        try:
            jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGO])
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        await get_current_user(request)

    insp = await db.inspections.find_one({"id": iid}, {"_id": 0})
    if not insp: raise HTTPException(status_code=404, detail="Inspection not found")
    vehicle = await db.vehicles.find_one({"id": insp["vehicle_id"]}, {"_id": 0}) or {}
    template = await db.templates.find_one({"id": insp["template_id"]}, {"_id": 0}) or {"sections": []}
    ans_map = {a["item_id"]: a for a in insp.get("answers", [])}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.6*inch, rightMargin=0.6*inch)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=colors.HexColor("#0f172a"))
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#334155"), spaceBefore=12, spaceAfter=6)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, textColor=colors.grey)
    story = []

    story.append(Paragraph("FleetCost Intelligence", small))
    story.append(Paragraph("Vehicle Inspection Report", h1))
    header_tbl = Table([
        ["Vehicle", f"{vehicle.get('name','?')}  ({vehicle.get('plate','?')})", "Inspector", insp.get("inspector_name","")],
        ["Template", template.get("name","?"), "Date", insp.get("created_at","")[:19].replace("T"," ")],
        ["Odometer", f"{insp.get('odometer','—')} km", "Failed items", str(insp.get("fail_count", 0))],
    ], colWidths=[1.1*inch, 2.6*inch, 1.1*inch, 2.6*inch])
    header_tbl.setStyle(TableStyle([
        ("FONT", (0,0), (-1,-1), "Helvetica", 9),
        ("FONT", (0,0), (0,-1), "Helvetica-Bold", 9),
        ("FONT", (2,0), (2,-1), "Helvetica-Bold", 9),
        ("TEXTCOLOR", (0,0), (0,-1), colors.HexColor("#64748b")),
        ("TEXTCOLOR", (2,0), (2,-1), colors.HexColor("#64748b")),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LINEBELOW", (0,0), (-1,-1), 0.25, colors.HexColor("#e2e8f0")),
    ]))
    story.append(header_tbl)

    for sec in template.get("sections", []):
        story.append(Paragraph(sec.get("title","Section"), h2))
        rows = [["Item", "Result", "Note"]]
        for it in sec.get("items", []):
            a = ans_map.get(it["id"], {})
            val = str(a.get("value","—"))
            rows.append([it.get("label",""), val, a.get("note","") or ""])
        t = Table(rows, colWidths=[3.3*inch, 1.0*inch, 3.1*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0f172a")),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONT", (0,0), (-1,0), "Helvetica-Bold", 9),
            ("FONT", (0,1), (-1,-1), "Helvetica", 9),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#f8fafc"), colors.white]),
            ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        # Color code Pass/Fail
        for ri, r in enumerate(rows[1:], start=1):
            v = r[1].lower()
            if v == "pass":
                t.setStyle(TableStyle([("TEXTCOLOR", (1, ri), (1, ri), colors.HexColor("#16a34a"))]))
            elif v == "fail":
                t.setStyle(TableStyle([("TEXTCOLOR", (1, ri), (1, ri), colors.HexColor("#dc2626")),
                                       ("FONT", (1, ri), (1, ri), "Helvetica-Bold", 9)]))
        story.append(t)
        story.append(Spacer(1, 6))

    if insp.get("notes"):
        story.append(Paragraph("General notes", h2))
        story.append(Paragraph(insp["notes"], body))

    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · FleetCost Intelligence", small))

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=inspection-{iid[:8]}.pdf"})

# --- Seed ---
async def seed():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]

    # Ensure default workspace exists
    if not await db.workspaces.find_one({"id": DEFAULT_WORKSPACE_ID}):
        await db.workspaces.insert_one({
            "id": DEFAULT_WORKSPACE_ID, "name": "FleetCost Demo Workspace",
            "owner_email": admin_email, "created_at": now_iso(),
        })

    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email, "name": "Fleet Owner",
            "role": "admin", "workspace_id": DEFAULT_WORKSPACE_ID,
            "password_hash": hash_pw(admin_password), "created_at": now_iso(),
        })
        logger.info(f"Seeded admin: {admin_email}")
    else:
        upd = {}
        if "workspace_id" not in existing: upd["workspace_id"] = DEFAULT_WORKSPACE_ID
        if not verify_pw(admin_password, existing["password_hash"]): upd["password_hash"] = hash_pw(admin_password)
        if upd: await db.users.update_one({"email": admin_email}, {"$set": upd})

    for email, name, role, pw in [
        ("manager@fleet.com", "Marcus Chen", "manager", "manager123"),
        ("inspector@fleet.com", "Sara Ortiz", "inspector", "inspector123"),
        ("mechanic@fleet.com", "Dan Fields", "mechanic", "mechanic123"),
    ]:
        existing_u = await db.users.find_one({"email": email})
        if not existing_u:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "email": email, "name": name,
                "role": role, "workspace_id": DEFAULT_WORKSPACE_ID,
                "password_hash": hash_pw(pw), "created_at": now_iso(),
            })
        elif "workspace_id" not in existing_u:
            await db.users.update_one({"email": email}, {"$set": {"workspace_id": DEFAULT_WORKSPACE_ID}})

    # Backfill workspace_id on any existing data (idempotent)
    for coll in ("vehicles", "templates", "inspections", "maintenance", "parts"):
        await db[coll].update_many({"workspace_id": {"$exists": False}}, {"$set": {"workspace_id": DEFAULT_WORKSPACE_ID}})

    # Vehicles
    if await db.vehicles.count_documents({"workspace_id": DEFAULT_WORKSPACE_ID}) == 0:
        vs = [
            {"name": "Falcon-01", "plate": "FLT-1001", "make": "Volvo", "model": "FH16", "year": 2022, "type": "truck", "status": "active", "odometer": 148200, "fuel_cost_per_km": 0.42, "image_url": "https://images.unsplash.com/photo-1695222833131-54ee679ae8e5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHw0fHxmbGVldCUyMHZlaGljbGUlMjB0cnVjayUyMGRyaXZpbmd8ZW58MHx8fHwxNzg2NjA5NjczfDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Falcon-02", "plate": "FLT-1002", "make": "Scania", "model": "R500", "year": 2021, "type": "truck", "status": "maintenance", "odometer": 210400, "fuel_cost_per_km": 0.45, "image_url": "https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHwzfHxmbGVldCUyMHZlaGljbGUlMjB0cnVjayUyMGRyaXZpbmd8ZW58MHx8fHwxNzg2NjA5NjczfDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Raven-11", "plate": "FLT-2011", "make": "Ford", "model": "Transit", "year": 2023, "type": "van", "status": "active", "odometer": 45000, "fuel_cost_per_km": 0.28},
            {"name": "Raven-12", "plate": "FLT-2012", "make": "Mercedes", "model": "Sprinter", "year": 2020, "type": "van", "status": "idle", "odometer": 189000, "fuel_cost_per_km": 0.31},
            {"name": "Titan-31", "plate": "FLT-3031", "make": "Peterbilt", "model": "579", "year": 2019, "type": "truck", "status": "active", "odometer": 315000, "fuel_cost_per_km": 0.48},
            {"name": "Titan-32", "plate": "FLT-3032", "make": "Kenworth", "model": "T680", "year": 2022, "type": "truck", "status": "active", "odometer": 92800, "fuel_cost_per_km": 0.44},
        ]
        for v in vs:
            v["id"] = str(uuid.uuid4())
            v["workspace_id"] = DEFAULT_WORKSPACE_ID
            v["created_at"] = now_iso()
        await db.vehicles.insert_many(vs)

    # Default template
    if await db.templates.count_documents({"workspace_id": DEFAULT_WORKSPACE_ID}) == 0:
        template = {
            "id": str(uuid.uuid4()),
            "workspace_id": DEFAULT_WORKSPACE_ID,
            "name": "Standard Pre-Trip Inspection",
            "description": "Comprehensive daily vehicle inspection checklist",
            "sections": [
                {"id": str(uuid.uuid4()), "title": "Tires & Wheels", "items": [
                    {"id": str(uuid.uuid4()), "label": "Tire pressure within spec", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "Tread depth >= 4/32", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "Wheel nuts secure", "type": "boolean", "required": True},
                ]},
                {"id": str(uuid.uuid4()), "title": "Brakes", "items": [
                    {"id": str(uuid.uuid4()), "label": "Brake pedal firmness", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "Parking brake functional", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "No brake fluid leaks", "type": "boolean", "required": True},
                ]},
                {"id": str(uuid.uuid4()), "title": "Fluids", "items": [
                    {"id": str(uuid.uuid4()), "label": "Engine oil level", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "Coolant level", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "Windshield washer fluid", "type": "boolean", "required": False},
                ]},
                {"id": str(uuid.uuid4()), "title": "Lights & Signals", "items": [
                    {"id": str(uuid.uuid4()), "label": "Headlights (low & high)", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "Turn signals", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "Brake lights", "type": "boolean", "required": True},
                ]},
                {"id": str(uuid.uuid4()), "title": "Engine & Body", "items": [
                    {"id": str(uuid.uuid4()), "label": "No unusual engine noise", "type": "boolean", "required": True},
                    {"id": str(uuid.uuid4()), "label": "Body condition rating", "type": "rating", "required": False},
                    {"id": str(uuid.uuid4()), "label": "Additional notes", "type": "text", "required": False},
                ]},
            ],
            "created_by": "system",
            "created_at": now_iso(),
        }
        await db.templates.insert_one(template)

    # Sample maintenance history (for KPIs)
    if await db.maintenance.count_documents({"workspace_id": DEFAULT_WORKSPACE_ID}) == 0:
        vehicles = await db.vehicles.find({"workspace_id": DEFAULT_WORKSPACE_ID}, {"_id": 0}).to_list(100)
        if vehicles:
            samples = [
                {"vehicle_id": vehicles[0]["id"], "title": "Oil & filter change", "priority": "low", "parts_cost": 85, "labor_cost": 60, "downtime_hours": 1.5, "status": "completed", "months_ago": 4},
                {"vehicle_id": vehicles[0]["id"], "title": "Brake pad replacement", "priority": "medium", "parts_cost": 240, "labor_cost": 180, "downtime_hours": 3.0, "status": "completed", "months_ago": 2},
                {"vehicle_id": vehicles[1]["id"], "title": "Turbocharger repair", "priority": "high", "parts_cost": 1800, "labor_cost": 900, "downtime_hours": 18, "status": "in_progress", "months_ago": 0},
                {"vehicle_id": vehicles[2]["id"], "title": "Tire rotation", "priority": "low", "parts_cost": 0, "labor_cost": 80, "downtime_hours": 1.0, "status": "completed", "months_ago": 3},
                {"vehicle_id": vehicles[3]["id"], "title": "Transmission service", "priority": "medium", "parts_cost": 320, "labor_cost": 260, "downtime_hours": 4.5, "status": "completed", "months_ago": 1},
                {"vehicle_id": vehicles[4]["id"], "title": "Coolant flush", "priority": "low", "parts_cost": 55, "labor_cost": 90, "downtime_hours": 2.0, "status": "completed", "months_ago": 5},
                {"vehicle_id": vehicles[4]["id"], "title": "Suspension inspection", "priority": "medium", "parts_cost": 420, "labor_cost": 340, "downtime_hours": 5.5, "status": "pending", "months_ago": 0},
                {"vehicle_id": vehicles[5]["id"], "title": "Air filter replacement", "priority": "low", "parts_cost": 45, "labor_cost": 40, "downtime_hours": 0.75, "status": "completed", "months_ago": 2},
            ]
            for s in samples:
                created = (datetime.now(timezone.utc) - timedelta(days=30 * s["months_ago"])).isoformat()
                completed = created if s["status"] == "completed" else None
                actual = (s["parts_cost"] + s["labor_cost"]) if s["status"] == "completed" else 0
                await db.maintenance.insert_one({
                    "id": str(uuid.uuid4()),
                    "workspace_id": DEFAULT_WORKSPACE_ID,
                    "vehicle_id": s["vehicle_id"],
                    "title": s["title"],
                    "description": "",
                    "priority": s["priority"],
                    "estimated_cost": s["parts_cost"] + s["labor_cost"],
                    "estimated_hours": s["downtime_hours"],
                    "parts_cost": s["parts_cost"],
                    "labor_cost": s["labor_cost"],
                    "actual_cost": actual,
                    "downtime_hours": s["downtime_hours"] if s["status"] == "completed" else 0,
                    "status": s["status"],
                    "assigned_to": None,
                    "created_at": created,
                    "completed_at": completed,
                    "created_by": "system",
                })

    # Seed parts
    if await db.parts.count_documents({"workspace_id": DEFAULT_WORKSPACE_ID}) == 0:
        parts = [
            {"name": "Engine Oil 5W-30 (1L)", "sku": "OIL-5W30", "category": "fluids", "stock": 24, "reorder_point": 12, "unit_cost": 8.50, "supplier": "Mobil", "supplier_email": "delivered@resend.dev"},
            {"name": "Brake Pad Set (Front)", "sku": "BRK-PAD-F", "category": "brakes", "stock": 6, "reorder_point": 8, "unit_cost": 62.00, "supplier": "Bosch", "supplier_email": "delivered@resend.dev"},
            {"name": "Brake Pad Set (Rear)", "sku": "BRK-PAD-R", "category": "brakes", "stock": 4, "reorder_point": 6, "unit_cost": 48.00, "supplier": "Bosch", "supplier_email": "delivered@resend.dev"},
            {"name": "Air Filter", "sku": "FLT-AIR", "category": "filters", "stock": 18, "reorder_point": 10, "unit_cost": 14.00, "supplier": "Mann", "supplier_email": "delivered@resend.dev"},
            {"name": "Oil Filter", "sku": "FLT-OIL", "category": "filters", "stock": 3, "reorder_point": 15, "unit_cost": 9.50, "supplier": "Mann", "supplier_email": "delivered@resend.dev"},
            {"name": "Coolant Antifreeze (5L)", "sku": "COOL-5L", "category": "fluids", "stock": 8, "reorder_point": 6, "unit_cost": 22.00, "supplier": "Prestone", "supplier_email": "delivered@resend.dev"},
            {"name": "Wiper Blade 22\"", "sku": "WIP-22", "category": "consumables", "stock": 14, "reorder_point": 8, "unit_cost": 11.00, "supplier": "Rain-X", "supplier_email": "delivered@resend.dev"},
            {"name": "Tire 275/70R22.5", "sku": "TIR-275", "category": "tires", "stock": 2, "reorder_point": 4, "unit_cost": 380.00, "supplier": "Michelin", "supplier_email": "delivered@resend.dev"},
        ]
        for p in parts:
            p["id"] = str(uuid.uuid4())
            p["workspace_id"] = DEFAULT_WORKSPACE_ID
            p["created_at"] = now_iso()
        await db.parts.insert_many(parts)

    await db.users.create_index("email", unique=True)
    await db.vehicles.create_index("id")
    await db.templates.create_index("id")
    await db.inspections.create_index("id")
    await db.maintenance.create_index("id")
    await db.parts.create_index("id")

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    await seed()
    logger.info("FleetCost API ready.")

@app.on_event("shutdown")
async def on_shutdown():
    client.close()
