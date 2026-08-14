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
import pyotp
import qrcode
from io import BytesIO
import base64 as b64
import csv as csvlib

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
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0, "totp_pending_secret": 0})
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

class DriverIn(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = ""
    license_number: str
    license_expiry: str  # YYYY-MM-DD
    hire_date: Optional[str] = ""
    assigned_vehicle_id: Optional[str] = None
    status: Literal["active", "inactive", "on_leave"] = "active"
    notes: Optional[str] = ""

class OCRIn(BaseModel):
    image_base64: str  # data URL or raw base64
    mode: Literal["plate", "odometer"] = "plate"

class TwoFAVerify(BaseModel):
    code: str

class LoginReq2FA(BaseModel):
    email: EmailStr
    password: str
    code: Optional[str] = None

class InspectionIn(BaseModel):
    template_id: str
    vehicle_id: str
    answers: List[InspectionAnswer] = []
    notes: Optional[str] = ""
    odometer: Optional[float] = None

class MaintenanceIn(BaseModel):
    vehicle_id: str
    inspection_id: Optional[str] = None
    driver_id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    estimated_cost: float = 0
    estimated_hours: float = 0
    assigned_to: Optional[str] = None  # mechanic user id
    parts_cost: float = 0
    labor_cost: float = 0

class IncidentIn(BaseModel):
    vehicle_id: str
    driver_id: Optional[str] = None
    kind: Literal["accident", "damage", "breakdown", "citation", "other"] = "damage"
    severity: Literal["minor", "moderate", "severe"] = "minor"
    occurred_at: str  # ISO datetime
    location: Optional[str] = ""
    description: str
    photos: List[str] = []  # base64 data URLs
    reported_cost: float = 0

class IncidentUpdate(BaseModel):
    driver_id: Optional[str] = None
    kind: Optional[Literal["accident", "damage", "breakdown", "citation", "other"]] = None
    severity: Optional[Literal["minor", "moderate", "severe"]] = None
    occurred_at: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    reported_cost: Optional[float] = None
    resolution_notes: Optional[str] = None
    resolved: Optional[bool] = None

class UserPrefs(BaseModel):
    dashboard_tiles: Optional[List[str]] = None

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
async def login(req: LoginReq2FA):
    email = req.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("totp_enabled"):
        if not req.code:
            return {"requires_2fa": True, "email": email}
        code = req.code.strip()
        totp = pyotp.TOTP(user["totp_secret"])
        totp_ok = len(code) == 6 and code.isdigit() and totp.verify(code, valid_window=1)
        recovery_used = False
        if not totp_ok:
            # Try recovery code (>= 8 chars)
            if len(code) >= 8:
                codes = user.get("recovery_codes", []) or []
                matched_idx = None
                for i, c in enumerate(codes):
                    if not c.get("used") and c.get("code", "").upper() == code.upper():
                        matched_idx = i
                        break
                if matched_idx is not None:
                    codes[matched_idx]["used"] = True
                    codes[matched_idx]["used_at"] = now_iso()
                    await db.users.update_one({"id": user["id"]}, {"$set": {"recovery_codes": codes}})
                    recovery_used = True
                    totp_ok = True
            if not totp_ok:
                raise HTTPException(status_code=401, detail="Invalid 2FA code")
        token = create_access_token(user["id"], user["email"], user["role"])
        user.pop("password_hash", None); user.pop("_id", None); user.pop("totp_secret", None); user.pop("recovery_codes", None); user.pop("totp_pending_secret", None)
        resp = {"user": user, "token": token}
        if recovery_used: resp["recovery_used"] = True
        return resp
    token = create_access_token(user["id"], user["email"], user["role"])
    user.pop("password_hash", None); user.pop("_id", None); user.pop("totp_secret", None)
    return {"user": user, "token": token}

@api.post("/auth/2fa/setup")
async def twofa_setup(user: dict = Depends(get_current_user)):
    """Generate a new TOTP secret + provisioning URI. Not yet enabled until verified."""
    secret = pyotp.random_base32()
    issuer = os.environ.get("EMAIL_FROM_NAME", "FleetIntel")
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name=issuer)
    # generate QR code as data URL
    img = qrcode.make(uri)
    buf = BytesIO(); img.save(buf, format="PNG"); buf.seek(0)
    qr_data_url = "data:image/png;base64," + b64.b64encode(buf.read()).decode()
    # Save as pending secret (not enabled yet)
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_pending_secret": secret}})
    return {"secret": secret, "uri": uri, "qr": qr_data_url, "issuer": issuer}

@api.post("/auth/2fa/enable")
async def twofa_enable(req: TwoFAVerify, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]})
    secret = u.get("totp_pending_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="No pending 2FA setup. Call /2fa/setup first.")
    totp = pyotp.TOTP(secret)
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    # Generate 8 recovery codes
    recovery = [{"code": secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10].upper(), "used": False} for _ in range(8)]
    await db.users.update_one({"id": user["id"]}, {
        "$set": {"totp_secret": secret, "totp_enabled": True, "recovery_codes": recovery},
        "$unset": {"totp_pending_secret": ""},
    })
    await log_event(user, "2fa.enabled", "user", user["id"])
    return {"enabled": True, "recovery_codes": [r["code"] for r in recovery]}

@api.post("/auth/2fa/regenerate-recovery")
async def twofa_regen_recovery(req: TwoFAVerify, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]})
    if not u.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="2FA not enabled")
    totp = pyotp.TOTP(u["totp_secret"])
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    recovery = [{"code": secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10].upper(), "used": False} for _ in range(8)]
    await db.users.update_one({"id": user["id"]}, {"$set": {"recovery_codes": recovery}})
    return {"recovery_codes": [r["code"] for r in recovery]}

@api.get("/auth/2fa/recovery-status")
async def twofa_recovery_status(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"recovery_codes": 1})
    codes = (u or {}).get("recovery_codes", [])
    return {"total": len(codes), "unused": sum(1 for c in codes if not c.get("used"))}

@api.post("/auth/2fa/disable")
async def twofa_disable(req: TwoFAVerify, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]})
    if not u.get("totp_enabled"):
        return {"enabled": False}
    totp = pyotp.TOTP(u["totp_secret"])
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    await db.users.update_one({"id": user["id"]}, {
        "$set": {"totp_enabled": False},
        "$unset": {"totp_secret": "", "totp_pending_secret": ""},
    })
    await log_event(user, "2fa.disabled", "user", user["id"])
    return {"enabled": False}

@api.get("/auth/2fa/status")
async def twofa_status(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"totp_enabled": 1})
    return {"enabled": bool(u and u.get("totp_enabled"))}

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

@api.get("/users/me/prefs")
async def get_my_prefs(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "prefs": 1})
    return (u or {}).get("prefs") or {}

@api.put("/users/me/prefs")
async def put_my_prefs(p: UserPrefs, user: dict = Depends(get_current_user)):
    patch = {k: v for k, v in p.model_dump(exclude_unset=True).items() if v is not None}
    if patch:
        await db.users.update_one({"id": user["id"]}, {"$set": {f"prefs.{k}": v for k, v in patch.items()}})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "prefs": 1})
    return (u or {}).get("prefs") or {}

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

# --- Drivers ---
@api.get("/drivers")
async def list_drivers(user: dict = Depends(get_current_user)):
    return await db.drivers.find(ws_filter(user), {"_id": 0}).sort("name", 1).to_list(1000)

@api.post("/drivers")
async def create_driver(d: dict, user: dict = Depends(get_current_user)):
    # Coerce empty-string email to None before Pydantic validation
    if isinstance(d.get("email"), str) and not d["email"].strip():
        d["email"] = None
    driver = DriverIn(**d)
    doc = driver.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["workspace_id"] = user["workspace_id"]
    doc["created_at"] = now_iso()
    await db.drivers.insert_one(doc)
    await log_event(user, "driver.created", "driver", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return doc

@api.get("/drivers/{did}")
async def get_driver(did: str, user: dict = Depends(get_current_user)):
    d = await db.drivers.find_one(ws_filter(user, {"id": did}), {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Not found")
    return d

@api.patch("/drivers/{did}")
async def update_driver(did: str, patch: dict, user: dict = Depends(get_current_user)):
    patch.pop("id", None); patch.pop("_id", None); patch.pop("workspace_id", None)
    await db.drivers.update_one(ws_filter(user, {"id": did}), {"$set": patch})
    return await db.drivers.find_one(ws_filter(user, {"id": did}), {"_id": 0})

@api.delete("/drivers/{did}")
async def delete_driver(did: str, user: dict = Depends(get_current_user)):
    await db.drivers.delete_one(ws_filter(user, {"id": did}))
    return {"ok": True}

@api.get("/drivers/{did}/history")
async def driver_history(did: str, user: dict = Depends(get_current_user)):
    d = await db.drivers.find_one(ws_filter(user, {"id": did}), {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Not found")
    if not d.get("assigned_vehicle_id"):
        return {"driver": d, "vehicle": None, "inspections": [], "maintenance": [], "total_cost": 0}
    vehicle = await db.vehicles.find_one(ws_filter(user, {"id": d["assigned_vehicle_id"]}), {"_id": 0})
    inspections = await db.inspections.find(ws_filter(user, {"vehicle_id": d["assigned_vehicle_id"]}), {"_id": 0}).sort("created_at", -1).to_list(200)
    maint = await db.maintenance.find(ws_filter(user, {"vehicle_id": d["assigned_vehicle_id"]}), {"_id": 0}).sort("created_at", -1).to_list(200)
    total = sum(m.get("actual_cost", 0) or 0 for m in maint if m.get("status") == "completed")
    return {"driver": d, "vehicle": vehicle, "inspections": inspections, "maintenance": maint, "total_cost": round(total, 2)}

# --- Investigation panel ---
@api.get("/investigate/{kpi_key}")
async def investigate(kpi_key: str, user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find(ws_filter(user), {"_id": 0}).to_list(1000)
    maint = await db.maintenance.find(ws_filter(user), {"_id": 0}).to_list(2000)
    vmap = {v["id"]: v for v in vehicles}
    def vname(vid): return vmap.get(vid, {}).get("name", "?")
    def vplate(vid): return vmap.get(vid, {}).get("plate", "")
    completed = [m for m in maint if m.get("status") == "completed"]
    if kpi_key == "total_maintenance_cost":
        rows = [{
            "vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
            "title": m["title"], "cost": round(m.get("actual_cost", 0) or 0, 2),
            "priority": m.get("priority", ""), "date": (m.get("completed_at") or m.get("created_at") or "")[:10],
        } for m in completed]
        rows.sort(key=lambda x: x["cost"], reverse=True)
        total = sum(r["cost"] for r in rows)
        return {"title": "Total maintenance cost", "total": total, "unit": "$", "columns": ["vehicle","plate","title","cost","priority","date"], "rows": rows[:200]}
    if kpi_key == "cost_per_vehicle":
        by = {}
        for m in completed:
            by.setdefault(m["vehicle_id"], 0)
            by[m["vehicle_id"]] += m.get("actual_cost", 0) or 0
        rows = [{"vehicle": vname(vid), "plate": vplate(vid), "cost": round(c, 2), "jobs": sum(1 for m in completed if m["vehicle_id"] == vid)} for vid, c in by.items()]
        rows.sort(key=lambda x: x["cost"], reverse=True)
        avg = round(sum(r["cost"] for r in rows) / len(vehicles), 2) if vehicles else 0
        return {"title": "Cost per vehicle", "total": avg, "unit": "$ avg", "columns": ["vehicle","plate","cost","jobs"], "rows": rows}
    if kpi_key == "pending_jobs":
        pend = [m for m in maint if m.get("status") in ("pending", "in_progress")]
        rows = [{"vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
                 "title": m["title"], "status": m["status"], "priority": m.get("priority", ""),
                 "estimated_cost": round(m.get("estimated_cost", 0) or 0, 2),
                 "created": (m.get("created_at") or "")[:10]} for m in pend]
        return {"title": "Pending jobs", "total": len(rows), "unit": "jobs", "columns": ["vehicle","plate","title","status","priority","estimated_cost","created"], "rows": rows}
    if kpi_key == "completed_jobs":
        rows = [{"vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
                 "title": m["title"], "cost": round(m.get("actual_cost", 0) or 0, 2),
                 "downtime": m.get("downtime_hours", 0), "completed": (m.get("completed_at") or "")[:10]} for m in completed]
        rows.sort(key=lambda x: x["completed"] or "", reverse=True)
        return {"title": "Completed jobs", "total": len(rows), "unit": "jobs", "columns": ["vehicle","plate","title","cost","downtime","completed"], "rows": rows}
    if kpi_key == "total_vehicles":
        rows = [{"name": v["name"], "plate": v["plate"], "make": v.get("make", ""), "model": v.get("model", ""), "status": v.get("status", ""), "odometer": v.get("odometer", 0)} for v in vehicles]
        return {"title": "Fleet vehicles", "total": len(rows), "unit": "vehicles", "columns": ["name","plate","make","model","status","odometer"], "rows": rows}
    if kpi_key == "downtime":
        rows = [{"vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
                 "title": m["title"], "downtime_hours": m.get("downtime_hours", 0),
                 "completed": (m.get("completed_at") or "")[:10]} for m in completed if (m.get("downtime_hours") or 0) > 0]
        rows.sort(key=lambda x: x["downtime_hours"], reverse=True)
        total = sum(r["downtime_hours"] for r in rows)
        return {"title": "Downtime hours", "total": total, "unit": "h", "columns": ["vehicle","plate","title","downtime_hours","completed"], "rows": rows}
    if kpi_key == "fuel_cost":
        rows = [{"vehicle": v["name"], "plate": v["plate"], "odometer_km": v.get("odometer", 0),
                 "fuel_rate": v.get("fuel_cost_per_km", 0),
                 "fuel_cost": round((v.get("odometer", 0) or 0) * (v.get("fuel_cost_per_km", 0) or 0), 2)} for v in vehicles]
        rows.sort(key=lambda x: x["fuel_cost"], reverse=True)
        total = sum(r["fuel_cost"] for r in rows)
        return {"title": "Fuel cost (lifetime)", "total": total, "unit": "$", "columns": ["vehicle","plate","odometer_km","fuel_rate","fuel_cost"], "rows": rows}
    if kpi_key == "utilization":
        rows = [{"vehicle": v["name"], "plate": v["plate"], "status": v.get("status", ""), "odometer": v.get("odometer", 0)} for v in vehicles]
        active = sum(1 for v in vehicles if v.get("status") == "active")
        return {"title": "Fleet utilization", "total": round(active / len(vehicles) * 100 if vehicles else 0, 1), "unit": "%", "columns": ["vehicle","plate","status","odometer"], "rows": rows}
    raise HTTPException(status_code=404, detail="Unknown KPI key")

# --- Insurance / Public share link ---
@api.post("/vehicles/{vid}/share")
async def create_share_link(vid: str, user: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one(ws_filter(user, {"id": vid}), {"_id": 0})
    if not v: raise HTTPException(status_code=404, detail="Not found")
    if not v.get("share_token"):
        token = secrets.token_urlsafe(24)
        await db.vehicles.update_one(ws_filter(user, {"id": vid}), {"$set": {"share_token": token, "share_created_at": now_iso()}})
    else:
        token = v["share_token"]
    await log_event(user, "vehicle.shared", "vehicle", vid, {"plate": v.get("plate")})
    return {"token": token, "url": f"/public/vehicle/{token}"}

@api.delete("/vehicles/{vid}/share")
async def revoke_share_link(vid: str, user: dict = Depends(get_current_user)):
    await db.vehicles.update_one(ws_filter(user, {"id": vid}), {"$unset": {"share_token": "", "share_created_at": ""}})
    return {"ok": True}

@api.get("/public/vehicle/{token}")
async def public_vehicle(token: str):
    v = await db.vehicles.find_one({"share_token": token}, {"_id": 0, "share_token": 0, "workspace_id": 0})
    if not v: raise HTTPException(status_code=404, detail="Not found or link revoked")
    workspace_id = (await db.vehicles.find_one({"share_token": token}, {"workspace_id": 1}))["workspace_id"]
    workspace = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0, "name": 1}) or {"name": "Fleet"}
    # inspections + safety-relevant maintenance history
    inspections = await db.inspections.find({"vehicle_id": v["id"]}, {"_id": 0, "workspace_id": 0, "inspector_id": 0}).sort("created_at", -1).to_list(50)
    # strip photos to keep payload lean
    for insp in inspections:
        insp["answers"] = [{k: vv for k, vv in a.items() if k != "photo"} for a in insp.get("answers", [])]
    maint = await db.maintenance.find({"vehicle_id": v["id"], "status": "completed"}, {"_id": 0, "workspace_id": 0}).sort("completed_at", -1).to_list(100)
    return {
        "workspace": workspace,
        "vehicle": v,
        "inspections": inspections,
        "maintenance_history": maint,
        "summary": {
            "total_inspections": len(inspections),
            "total_maintenance": len(maint),
            "total_maintenance_cost": round(sum(m.get("actual_cost", 0) or 0 for m in maint), 2),
            "recent_fail_count": sum(insp.get("fail_count", 0) or 0 for insp in inspections[:5]),
        }
    }

# --- Unified alerts + Timeline + Incidents ---
@api.get("/alerts")
async def unified_alerts(user: dict = Depends(get_current_user)):
    from datetime import datetime as _dt
    parts = await db.parts.find(ws_filter(user), {"_id": 0}).to_list(1000)
    low_stock = [p for p in parts if (p.get("stock", 0) or 0) <= (p.get("reorder_point", 0) or 0)]
    drivers = await db.drivers.find(ws_filter(user), {"_id": 0}).to_list(1000)
    expiring = []
    for d in drivers:
        try:
            days = (_dt.strptime(d["license_expiry"], "%Y-%m-%d").date() - _dt.now().date()).days
            if days <= 30:
                expiring.append({"driver_id": d["id"], "name": d["name"], "days": days, "expiry": d["license_expiry"]})
        except Exception: pass
    maint = await db.maintenance.find(ws_filter(user), {"_id": 0}).to_list(1000)
    pending = [m for m in maint if m.get("status") in ("pending", "in_progress")]
    critical = [m for m in maint if m.get("priority") == "critical" and m.get("status") != "completed"]
    incidents = await db.incidents.find(ws_filter(user), {"_id": 0}).sort("occurred_at", -1).to_list(200)
    open_incidents = [i for i in incidents if i.get("severity") in ("moderate", "severe")]
    # anomalies (reuse quick logic)
    completed = [m for m in maint if m.get("status") == "completed"]
    by_v = {}
    for m in completed:
        d = m.get("completed_at") or m.get("created_at") or ""
        mo = d[:7]
        if not mo: continue
        by_v.setdefault(m["vehicle_id"], {}).setdefault(mo, 0)
        by_v[m["vehicle_id"]][mo] += m.get("actual_cost", 0) or 0
    anomalies = 0
    for vid, months in by_v.items():
        if len(months) < 3: continue
        vals = [v for _, v in sorted(months.items())]
        latest = vals[-1]; hist = vals[:-1]
        mean = sum(hist) / len(hist)
        std = (sum((x - mean) ** 2 for x in hist) / len(hist)) ** 0.5
        if std > 0 and latest > mean + 1.5 * std: anomalies += 1
    critical_count = len(critical) + len(open_incidents) + sum(1 for e in expiring if e["days"] < 0)
    warning_count = anomalies + len(low_stock) + sum(1 for e in expiring if 0 <= e["days"] <= 30)
    return {
        "critical": critical_count,
        "warnings": warning_count,
        "total": critical_count + warning_count,
        "buckets": {
            "maintenance_critical": len(critical),
            "cost_anomalies": anomalies,
            "license_expiring": len(expiring),
            "pending_jobs": len(pending),
            "low_stock_parts": len(low_stock),
            "open_incidents": len(open_incidents),
        },
        "details": {
            "expiring_drivers": expiring[:10],
            "critical_jobs": [{"id": m["id"], "title": m["title"], "vehicle_id": m["vehicle_id"]} for m in critical[:10]],
            "open_incidents": [{"id": i["id"], "description": i["description"][:60], "severity": i["severity"], "vehicle_id": i["vehicle_id"]} for i in open_incidents[:10]],
        }
    }

@api.get("/vehicles/{vid}/timeline")
async def vehicle_timeline(vid: str, user: dict = Depends(get_current_user)):
    events = []
    async for i in db.inspections.find(ws_filter(user, {"vehicle_id": vid}), {"_id": 0}):
        events.append({"type": "inspection", "at": i.get("created_at"), "title": f"Inspection · {i.get('fail_count', 0)} failed", "by": i.get("inspector_name"), "meta": {"id": i["id"], "fail_count": i.get("fail_count", 0)}})
    async for m in db.maintenance.find(ws_filter(user, {"vehicle_id": vid}), {"_id": 0}):
        events.append({"type": "maintenance", "at": m.get("created_at"), "title": m.get("title", ""), "by": None, "meta": {"id": m["id"], "status": m.get("status"), "cost": m.get("actual_cost") or m.get("estimated_cost") or 0, "priority": m.get("priority")}})
    async for inc in db.incidents.find(ws_filter(user, {"vehicle_id": vid}), {"_id": 0}):
        events.append({"type": "incident", "at": inc.get("occurred_at"), "title": f"{inc.get('kind', '').title()} · {inc.get('severity')}", "by": None, "meta": {"id": inc["id"], "description": inc.get("description", "")[:120], "severity": inc.get("severity")}})
    events.sort(key=lambda e: e["at"] or "", reverse=True)
    return events

@api.get("/incidents")
async def list_incidents(vehicle_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = ws_filter(user, {"vehicle_id": vehicle_id} if vehicle_id else {})
    incs = await db.incidents.find(q, {"_id": 0}).sort("occurred_at", -1).to_list(500)
    # enrich with vehicle + driver names for fleet-wide index
    v_ids = list({i.get("vehicle_id") for i in incs if i.get("vehicle_id")})
    d_ids = list({i.get("driver_id") for i in incs if i.get("driver_id")})
    vmap = {v["id"]: v for v in await db.vehicles.find(ws_filter(user, {"id": {"$in": v_ids}}), {"_id": 0, "id": 1, "name": 1, "plate": 1}).to_list(1000)} if v_ids else {}
    dmap = {d["id"]: d for d in await db.drivers.find(ws_filter(user, {"id": {"$in": d_ids}}), {"_id": 0, "id": 1, "name": 1}).to_list(1000)} if d_ids else {}
    for i in incs:
        v = vmap.get(i.get("vehicle_id") or "", {})
        d = dmap.get(i.get("driver_id") or "", {})
        i["vehicle_name"] = v.get("name")
        i["vehicle_plate"] = v.get("plate")
        i["driver_name"] = d.get("name")
    return incs

@api.post("/incidents")
async def create_incident(inc: IncidentIn, user: dict = Depends(get_current_user)):
    doc = inc.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["workspace_id"] = user["workspace_id"]
    doc["reporter_id"] = user["id"]
    doc["reporter_name"] = user["name"]
    doc["created_at"] = now_iso()
    await db.incidents.insert_one(doc)
    await log_event(user, "incident.reported", "incident", doc["id"], {"kind": doc["kind"], "severity": doc["severity"]})
    doc.pop("_id", None)
    return doc

@api.patch("/incidents/{iid}")
async def update_incident(iid: str, patch: IncidentUpdate, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    data["updated_at"] = now_iso()
    if data.get("resolved") is True and "resolved_at" not in data:
        data["resolved_at"] = now_iso()
    res = await db.incidents.update_one(ws_filter(user, {"id": iid}), {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    await log_event(user, "incident.updated", "incident", iid, {"fields": list(data.keys())})
    doc = await db.incidents.find_one(ws_filter(user, {"id": iid}), {"_id": 0})
    return doc

@api.delete("/incidents/{iid}")
async def delete_incident(iid: str, user: dict = Depends(get_current_user)):
    await db.incidents.delete_one(ws_filter(user, {"id": iid}))
    return {"ok": True}

@api.get("/analytics/fleet-health")
async def fleet_health(user: dict = Depends(get_current_user)):
    """Returns per-vehicle health score (0-100) and contributing factors."""
    return await _compute_fleet_health(user["workspace_id"])

@api.get("/analytics/vehicle/{vid}/health-trend")
async def vehicle_health_trend(vid: str, days: int = 30, user: dict = Depends(get_current_user)):
    """Backfilled daily health score for a single vehicle across the last N days."""
    days = max(7, min(days, 180))
    v = await db.vehicles.find_one(ws_filter(user, {"id": vid}), {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    insp = await db.inspections.find(ws_filter(user, {"vehicle_id": vid}), {"_id": 0}).to_list(2000)
    maint = await db.maintenance.find(ws_filter(user, {"vehicle_id": vid}), {"_id": 0}).to_list(2000)
    inc = await db.incidents.find(ws_filter(user, {"vehicle_id": vid}), {"_id": 0}).to_list(2000)
    drivers = await db.drivers.find(ws_filter(user, {"assigned_vehicle_id": vid}), {"_id": 0}).to_list(50)
    driver = drivers[0] if drivers else None
    now = datetime.now(timezone.utc)
    trend = []
    for delta in range(days - 1, -1, -1):
        as_of = now - timedelta(days=delta)
        r = _score_vehicle(v, insp, maint, inc, driver, as_of=as_of)
        trend.append({"date": as_of.date().isoformat(), "score": r["score"], "status": r["status"]})
    return {"vehicle_id": vid, "name": v.get("name"), "plate": v.get("plate"), "trend": trend}

async def _compute_fleet_health(workspace_id: str):
    """Shared computation used by endpoint, trend, and health digest cron."""
    ws = {"workspace_id": workspace_id}
    vehicles = await db.vehicles.find(ws, {"_id": 0}).to_list(1000)
    all_insp = await db.inspections.find(ws, {"_id": 0}).to_list(2000)
    all_maint = await db.maintenance.find(ws, {"_id": 0}).to_list(2000)
    all_inc = await db.incidents.find(ws, {"_id": 0}).to_list(2000)
    drivers = await db.drivers.find(ws, {"_id": 0}).to_list(1000)
    driver_by_vehicle = {}
    for d in drivers:
        if d.get("assigned_vehicle_id"):
            driver_by_vehicle[d["assigned_vehicle_id"]] = d
    now = datetime.now(timezone.utc)
    results = []
    for v in vehicles:
        results.append(_score_vehicle(v, all_insp, all_maint, all_inc, driver_by_vehicle.get(v["id"]), as_of=now))
    results.sort(key=lambda r: r["score"])  # worst first
    return results

def _score_vehicle(v: dict, insp_list: list, maint_list: list, inc_list: list, driver: Optional[dict], as_of: datetime):
    """Deterministic health score (0-100) for a vehicle at a point in time."""
    vid = v["id"]
    ninety = as_of - timedelta(days=90)
    def _parse(d):
        try: return datetime.fromisoformat(d.replace("Z", "+00:00")) if d else None
        except Exception: return None
    score = 100
    factors = []
    # Inspection fails in the 90 days preceding as_of (and before as_of)
    recent_fails = sum(
        (i.get("fail_count", 0) or 0)
        for i in insp_list
        if i.get("vehicle_id") == vid and (_parse(i.get("created_at")) or as_of) <= as_of
        and (_parse(i.get("created_at")) or as_of) >= ninety
    )
    if recent_fails > 0:
        deduction = min(30, recent_fails * 8)
        score -= deduction
        factors.append({"key": "inspection_fails", "label": f"{recent_fails} failed inspection item(s) in 90d", "impact": -deduction})
    # Maintenance backlog open at as_of (created before as_of, not completed before as_of)
    def _open_at(m):
        created = _parse(m.get("created_at")) or as_of
        if created > as_of: return False
        completed = _parse(m.get("completed_at"))
        if m.get("status") == "completed" and completed and completed <= as_of:
            return False
        # cancelled counts as not-open only after cancel time; treat as closed if status cancelled
        if m.get("status") == "cancelled":
            return False
        return True
    pending = [m for m in maint_list if m.get("vehicle_id") == vid and _open_at(m)]
    critical_pending = [m for m in pending if m.get("priority") == "critical"]
    if critical_pending:
        score -= 20
        factors.append({"key": "critical_maintenance", "label": f"{len(critical_pending)} critical maintenance open", "impact": -20})
    if pending:
        deduction = min(20, len(pending) * 4)
        score -= deduction
        factors.append({"key": "pending_maintenance", "label": f"{len(pending)} pending maintenance job(s)", "impact": -deduction})
    # Recent incidents in the 90 days preceding as_of
    vinc = [i for i in inc_list if i.get("vehicle_id") == vid and (_parse(i.get("occurred_at")) or as_of) <= as_of and (_parse(i.get("occurred_at")) or as_of) >= ninety]
    sev_weight = {"severe": 20, "moderate": 12, "minor": 4}
    inc_deduction = min(35, sum(sev_weight.get(i.get("severity"), 4) for i in vinc))
    if inc_deduction > 0:
        score -= inc_deduction
        factors.append({"key": "incidents", "label": f"{len(vinc)} incident(s) in 90d", "impact": -inc_deduction})
    # Driver license
    if driver and driver.get("license_expiry"):
        try:
            days_left = (datetime.strptime(driver["license_expiry"], "%Y-%m-%d").date() - as_of.date()).days
            if days_left < 0:
                score -= 20
                factors.append({"key": "license_expired", "label": f"Driver license expired ({driver['name']})", "impact": -20})
            elif days_left <= 30:
                score -= 8
                factors.append({"key": "license_expiring", "label": f"Driver license expires in {days_left}d", "impact": -8})
        except Exception: pass
    score = max(0, min(100, score))
    status = "healthy" if score >= 80 else "watch" if score >= 55 else "at_risk"
    return {
        "vehicle_id": vid,
        "name": v.get("name"),
        "plate": v.get("plate"),
        "score": score,
        "status": status,
        "factors": factors,
    }

# --- Bulk CSV import ---
def _parse_csv(text: str) -> list:
    reader = csvlib.DictReader(BytesIO(text.encode()).read().decode().splitlines())
    return [row for row in reader]

@api.post("/import/vehicles")
async def import_vehicles(payload: dict, user: dict = Depends(get_current_user)):
    text = payload.get("csv", "")
    if not text.strip(): raise HTTPException(status_code=400, detail="Empty CSV")
    rows = list(csvlib.DictReader(text.splitlines()))
    created = 0; errors = []
    for i, r in enumerate(rows):
        try:
            doc = {
                "id": str(uuid.uuid4()),
                "workspace_id": user["workspace_id"],
                "name": r.get("name") or r.get("Name") or "",
                "plate": r.get("plate") or r.get("Plate") or r.get("license_plate") or "",
                "make": r.get("make") or r.get("Make") or "",
                "model": r.get("model") or r.get("Model") or "",
                "year": int(r.get("year") or r.get("Year") or 2023),
                "type": (r.get("type") or "truck").lower(),
                "status": (r.get("status") or "active").lower(),
                "odometer": float(r.get("odometer") or 0),
                "fuel_cost_per_km": float(r.get("fuel_cost_per_km") or 0.35),
                "created_at": now_iso(),
            }
            if not doc["name"] or not doc["plate"]:
                raise ValueError("name and plate required")
            await db.vehicles.insert_one(doc)
            created += 1
        except Exception as e:
            errors.append(f"row {i+2}: {e}")
    await log_event(user, "vehicles.imported", "vehicle", "", {"created": created, "errors": len(errors)})
    return {"created": created, "errors": errors}

@api.post("/import/parts")
async def import_parts(payload: dict, user: dict = Depends(get_current_user)):
    text = payload.get("csv", "")
    if not text.strip(): raise HTTPException(status_code=400, detail="Empty CSV")
    rows = list(csvlib.DictReader(text.splitlines()))
    created = 0; errors = []
    for i, r in enumerate(rows):
        try:
            doc = {
                "id": str(uuid.uuid4()),
                "workspace_id": user["workspace_id"],
                "sku": r.get("sku") or r.get("SKU") or "",
                "name": r.get("name") or r.get("Name") or "",
                "category": (r.get("category") or "general").lower(),
                "supplier": r.get("supplier") or "",
                "supplier_email": r.get("supplier_email") or "",
                "stock": int(float(r.get("stock") or 0)),
                "reorder_point": int(float(r.get("reorder_point") or 5)),
                "unit_cost": float(r.get("unit_cost") or 0),
                "created_at": now_iso(),
            }
            if not doc["sku"] or not doc["name"]:
                raise ValueError("sku and name required")
            await db.parts.insert_one(doc)
            created += 1
        except Exception as e:
            errors.append(f"row {i+2}: {e}")
    await log_event(user, "parts.imported", "part", "", {"created": created, "errors": len(errors)})
    return {"created": created, "errors": errors}

@api.post("/import/drivers")
async def import_drivers(payload: dict, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admins/managers can bulk-invite drivers")
    text = payload.get("csv", "")
    if not text.strip(): raise HTTPException(status_code=400, detail="Empty CSV")
    rows = list(csvlib.DictReader(text.splitlines()))
    created = 0; errors = []
    for i, r in enumerate(rows):
        try:
            email = (r.get("email") or "").lower().strip()
            name = r.get("name") or ""
            role = (r.get("role") or "mechanic").lower()
            if not email or not name:
                raise ValueError("email and name required")
            if await db.users.find_one({"email": email, "workspace_id": user["workspace_id"]}):
                raise ValueError("already a member")
            code = secrets.token_urlsafe(12)
            await db.invites.insert_one({
                "id": str(uuid.uuid4()), "workspace_id": user["workspace_id"],
                "code": code, "email": email, "role": role,
                "created_by": user["id"], "created_at": now_iso(),
                "used_by": None, "used_at": None,
                "invitee_name": name,
            })
            created += 1
        except Exception as e:
            errors.append(f"row {i+2}: {e}")
    await log_event(user, "drivers.imported", "invite", "", {"created": created, "errors": len(errors)})
    return {"created": created, "errors": errors}

# --- Weekly digest (PDF + email) ---
async def _build_weekly_digest_pdf(workspace_id: str) -> tuple:
    """Build the digest PDF for a workspace. Returns (pdf_bytes, kpi_dict)."""
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors as rlc
    user_stub = {"workspace_id": workspace_id}
    vehicles = await db.vehicles.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(1000)
    maint = await db.maintenance.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(2000)
    parts = await db.parts.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(1000)
    completed = [m for m in maint if m.get("status") == "completed"]
    pending = [m for m in maint if m.get("status") in ("pending", "in_progress")]
    total_cost = sum(m.get("actual_cost", 0) or 0 for m in completed)
    low_stock = [p for p in parts if (p.get("stock", 0) or 0) <= (p.get("reorder_point", 0) or 0)]
    # Anomalies (reuse logic simplified)
    by_v = {}
    for m in completed:
        d = m.get("completed_at") or m.get("created_at") or ""
        mo = d[:7]
        if not mo: continue
        by_v.setdefault(m["vehicle_id"], {}).setdefault(mo, 0)
        by_v[m["vehicle_id"]][mo] += m.get("actual_cost", 0) or 0
    anomalies = []
    vmap = {v["id"]: v for v in vehicles}
    for vid, months in by_v.items():
        if len(months) < 3: continue
        series = sorted(months.items())
        vals = [s[1] for s in series]
        latest = vals[-1]; hist = vals[:-1]
        mean = sum(hist) / len(hist)
        std = (sum((x - mean) ** 2 for x in hist) / len(hist)) ** 0.5
        if std > 0 and latest > mean + 1.5 * std:
            anomalies.append({"vehicle": vmap.get(vid, {}).get("name", "?"), "spend": round(latest, 0), "mean": round(mean, 0)})
    kpi = {
        "vehicles": len(vehicles), "active": sum(1 for v in vehicles if v.get("status") == "active"),
        "in_maint": sum(1 for v in vehicles if v.get("status") == "maintenance"),
        "total_cost": round(total_cost, 2), "pending_jobs": len(pending),
        "completed_jobs": len(completed), "low_stock": len(low_stock),
        "anomalies": len(anomalies),
    }
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.6*inch, rightMargin=0.6*inch)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=rlc.HexColor("#0f172a"))
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=rlc.HexColor("#059669"), spaceBefore=12, spaceAfter=6)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, textColor=rlc.grey)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10)
    story = []
    story.append(Paragraph("FleetIntel · Weekly Digest", small))
    story.append(Paragraph(f"Week of {datetime.now(timezone.utc).strftime('%B %d, %Y')}", h1))
    kpi_rows = [
        ["Vehicles", str(kpi["vehicles"]), "Active", str(kpi["active"])],
        ["In maintenance", str(kpi["in_maint"]), "Total spend", f"${kpi['total_cost']:,.0f}"],
        ["Pending jobs", str(kpi["pending_jobs"]), "Completed jobs", str(kpi["completed_jobs"])],
        ["Low-stock parts", str(kpi["low_stock"]), "Cost anomalies", str(kpi["anomalies"])],
    ]
    t = Table(kpi_rows, colWidths=[1.4*inch, 2.0*inch, 1.4*inch, 2.0*inch])
    t.setStyle(TableStyle([
        ("FONT", (0,0), (-1,-1), "Helvetica", 10),
        ("FONT", (0,0), (0,-1), "Helvetica-Bold", 9),
        ("FONT", (2,0), (2,-1), "Helvetica-Bold", 9),
        ("TEXTCOLOR", (0,0), (0,-1), rlc.HexColor("#64748b")),
        ("TEXTCOLOR", (2,0), (2,-1), rlc.HexColor("#64748b")),
        ("LINEBELOW", (0,0), (-1,-1), 0.25, rlc.HexColor("#e2e8f0")),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    if anomalies:
        story.append(Paragraph("Cost anomalies", h2))
        rows = [["Vehicle", "This month", "Normal (avg)"]] + [[a["vehicle"], f"${a['spend']:,.0f}", f"${a['mean']:,.0f}"] for a in anomalies[:10]]
        at = Table(rows, colWidths=[3.0*inch, 2.0*inch, 2.0*inch])
        at.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), rlc.HexColor("#059669")),
            ("TEXTCOLOR", (0,0), (-1,0), rlc.white),
            ("FONT", (0,0), (-1,0), "Helvetica-Bold", 9),
            ("FONT", (0,1), (-1,-1), "Helvetica", 9),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [rlc.HexColor("#f8fafc"), rlc.white]),
            ("GRID", (0,0), (-1,-1), 0.25, rlc.HexColor("#e2e8f0")),
        ]))
        story.append(at)
    if pending:
        story.append(Paragraph("Pending maintenance", h2))
        rows = [["Job", "Vehicle", "Priority", "Est. cost"]]
        for j in pending[:15]:
            v = vmap.get(j["vehicle_id"], {})
            rows.append([j.get("title", "")[:40], v.get("name", "?"), j.get("priority", ""), f"${(j.get('estimated_cost') or 0):,.0f}"])
        pt = Table(rows, colWidths=[3.0*inch, 1.6*inch, 1.0*inch, 1.4*inch])
        pt.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), rlc.HexColor("#0f172a")),
            ("TEXTCOLOR", (0,0), (-1,0), rlc.white),
            ("FONT", (0,0), (-1,0), "Helvetica-Bold", 9),
            ("FONT", (0,1), (-1,-1), "Helvetica", 9),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [rlc.HexColor("#f8fafc"), rlc.white]),
            ("GRID", (0,0), (-1,-1), 0.25, rlc.HexColor("#e2e8f0")),
        ]))
        story.append(pt)
    if low_stock:
        story.append(Paragraph("Parts below reorder point", h2))
        rows = [["Part", "SKU", "Stock", "Reorder pt"]]
        for p in low_stock[:15]:
            rows.append([p.get("name", "")[:40], p.get("sku", ""), str(p.get("stock", 0)), str(p.get("reorder_point", 0))])
        lt = Table(rows, colWidths=[3.0*inch, 1.6*inch, 1.0*inch, 1.4*inch])
        lt.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), rlc.HexColor("#0f172a")),
            ("TEXTCOLOR", (0,0), (-1,0), rlc.white),
            ("FONT", (0,0), (-1,0), "Helvetica-Bold", 9),
            ("FONT", (0,1), (-1,-1), "Helvetica", 9),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [rlc.HexColor("#f8fafc"), rlc.white]),
            ("GRID", (0,0), (-1,-1), 0.25, rlc.HexColor("#e2e8f0")),
        ]))
        story.append(lt)
    story.append(Spacer(1, 12))
    story.append(Paragraph("Generated by FleetIntel · Cost Intelligence Platform", small))
    doc.build(story)
    buf.seek(0)
    return buf.getvalue(), kpi

async def _send_workspace_digest(workspace_id: str):
    """Send a weekly digest email to the workspace owner. Returns email_id or None."""
    ws = await db.workspaces.find_one({"id": workspace_id})
    if not ws: return None
    owner_email = ws.get("owner_email")
    if not owner_email: return None
    _, kpi = await _build_weekly_digest_pdf(workspace_id)
    from_name = os.environ.get("EMAIL_FROM_NAME", "FleetIntel")
    subject = f"Your weekly {from_name} digest"
    html = (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#0f172a">'
        f'<tr><td style="padding:24px;border-bottom:3px solid #34C759">'
        f'<div style="font-size:12px;letter-spacing:0.2em;color:#64748b;text-transform:uppercase">{escape(from_name)}</div>'
        f'<h1 style="margin:8px 0 0 0;font-size:24px">Weekly digest</h1>'
        f'<div style="color:#64748b;margin-top:4px">{escape(ws.get("name", "Workspace"))}</div></td></tr>'
        f'<tr><td style="padding:24px">'
        f'<p style="margin:0 0 16px 0">Here\'s your fleet snapshot for the week:</p>'
        f'<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0">'
        f'<tr><td style="padding:12px;background:#ecfdf5;font-weight:bold;color:#065f46;width:50%">Total spend</td><td style="padding:12px;background:#f8fafc;font-size:20px;font-weight:bold">${kpi["total_cost"]:,.0f}</td></tr>'
        f'<tr><td style="padding:12px;background:#ecfdf5;font-weight:bold;color:#065f46">Vehicles</td><td style="padding:12px;background:#f8fafc">{kpi["vehicles"]} · {kpi["active"]} active · {kpi["in_maint"]} in maintenance</td></tr>'
        f'<tr><td style="padding:12px;background:#ecfdf5;font-weight:bold;color:#065f46">Maintenance jobs</td><td style="padding:12px;background:#f8fafc">{kpi["pending_jobs"]} pending · {kpi["completed_jobs"]} completed</td></tr>'
        f'<tr><td style="padding:12px;background:#fef2f2;font-weight:bold;color:#991b1b">Cost anomalies</td><td style="padding:12px;background:#f8fafc"><strong>{kpi["anomalies"]}</strong> vehicle(s) above their normal band</td></tr>'
        f'<tr><td style="padding:12px;background:#fef2f2;font-weight:bold;color:#991b1b">Low-stock parts</td><td style="padding:12px;background:#f8fafc"><strong>{kpi["low_stock"]}</strong> at or below reorder point</td></tr>'
        f'</table>'
        f'<p style="margin:16px 0 0 0;font-size:12px;color:#888">Sent by {escape(from_name)}. We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )
    return await send_email(to=owner_email, subject=subject, html=html)

@api.post("/cron/weekly-digest")
async def cron_weekly_digest(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    expected = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not expected or not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    async def _run():
        workspaces = await db.workspaces.find({}, {"_id": 0}).to_list(1000)
        for ws in workspaces:
            try:
                await _send_workspace_digest(ws["id"])
            except Exception as e:
                logger.error(f"digest for {ws.get('id')} failed: {e}")
    asyncio.create_task(_run())
    return {"ok": True, "queued": True}

@api.post("/workspace/send-digest")
async def send_digest_now(user: dict = Depends(get_current_user)):
    """Manual trigger of the weekly digest for this workspace."""
    email_id = await _send_workspace_digest(user["workspace_id"])
    await log_event(user, "digest.sent", "workspace", user["workspace_id"], {"email_id": email_id})
    return {"sent": bool(email_id), "email_id": email_id}

async def _send_health_digest(workspace_id: str) -> Optional[str]:
    """Emails the workspace owner a list of at-risk & watch vehicles with top factors."""
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0}) or {"id": workspace_id, "name": "FleetIntel Workspace"}
    owner = await db.users.find_one({"id": ws.get("owner_id")}, {"_id": 0, "email": 1, "name": 1}) if ws.get("owner_id") else None
    if not owner:
        owner = await db.users.find_one({"workspace_id": workspace_id, "role": "admin"}, {"_id": 0, "email": 1, "name": 1})
    if not owner:
        logger.warning(f"health digest for {workspace_id}: no owner/admin to email")
        return None
    scores = await _compute_fleet_health(workspace_id)
    at_risk = [s for s in scores if s["status"] in ("at_risk", "watch")]
    subject = f"Fleet health · {len(at_risk)} vehicle(s) need attention"
    from_name = os.environ.get("EMAIL_FROM_NAME", "FleetIntel")
    def _row(s: dict) -> str:
        colour = "#dc2626" if s["status"] == "at_risk" else "#d97706"
        label = "AT RISK" if s["status"] == "at_risk" else "WATCH"
        factors_html = "".join(
            f'<div style="font-size:12px;color:#475569;margin-top:2px">• {escape(f["label"])} <span style="color:#dc2626">({f["impact"]})</span></div>'
            for f in s["factors"][:3]
        )
        return (
            f'<tr><td style="padding:12px;border-bottom:1px solid #e2e8f0">'
            f'<div style="display:flex;justify-content:space-between;align-items:center">'
            f'<div><strong>{escape(s["name"] or "")}</strong> <span style="color:#64748b;font-family:monospace;font-size:12px">{escape(s["plate"] or "")}</span></div>'
            f'<div><span style="background:{colour};color:#fff;padding:2px 8px;font-size:10px;letter-spacing:0.1em">{label} · {s["score"]}</span></div>'
            f'</div>{factors_html}</td></tr>'
        )
    rows_html = "".join(_row(s) for s in at_risk[:20]) or '<tr><td style="padding:12px;color:#64748b">All vehicles healthy this week.</td></tr>'
    html = (
        f'<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;color:#0f172a">'
        f'<tr><td style="padding:24px;border-bottom:3px solid #34C759">'
        f'<div style="font-size:12px;letter-spacing:0.2em;color:#64748b;text-transform:uppercase">{escape(from_name)}</div>'
        f'<h1 style="margin:8px 0 0 0;font-size:22px">Fleet health digest</h1>'
        f'<div style="color:#64748b;margin-top:4px">{escape(ws.get("name", "Workspace"))}</div></td></tr>'
        f'<tr><td style="padding:24px">'
        f'<p style="margin:0 0 16px 0">Here are the vehicles trending below 80 this week. Address these before they escalate to failure.</p>'
        f'<table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0">{rows_html}</table>'
        f'<p style="margin:20px 0 0 0;font-size:12px;color:#888">Sent by {escape(from_name)}. We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )
    return await send_email(to=owner["email"], subject=subject, html=html)

@api.post("/cron/health-digest")
async def cron_health_digest(request: Request):
    auth = request.headers.get("Authorization", "")
    expected = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not expected or not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    async def _run():
        workspaces = await db.workspaces.find({}, {"_id": 0}).to_list(1000)
        for ws in workspaces:
            try:
                await _send_health_digest(ws["id"])
            except Exception as e:
                logger.error(f"health digest for {ws.get('id')} failed: {e}")
    asyncio.create_task(_run())
    return {"ok": True, "queued": True}

@api.post("/workspace/send-health-digest")
async def send_health_digest_now(user: dict = Depends(get_current_user)):
    """Manual trigger of the health digest for this workspace."""
    email_id = await _send_health_digest(user["workspace_id"])
    await log_event(user, "health_digest.sent", "workspace", user["workspace_id"], {"email_id": email_id})
    return {"sent": bool(email_id), "email_id": email_id}

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
