from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import re
import ipaddress
import secrets
import hashlib
import asyncio
import logging
import uuid
import jwt
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta, date as date_cls
from typing import List, Optional, Literal, Dict
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from PIL import Image as PILImage
try:
    # Only available inside Emergent's own hosted platform image, not on public PyPI —
    # OCR endpoint degrades to a 503 outside that environment instead of failing to boot.
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
except ImportError:
    LlmChat = UserMessage = ImageContent = None
import pyotp
import qrcode
from io import BytesIO
import base64 as b64
import csv as csvlib

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

import auth_supabase
from db import fetch_one, fetch_all, execute, execute_many, update_row, json_dumps
from maintenance_scheduling import Interval, compute_due_state, classify_status, reset_schedule_on_completion, reminders_to_fire

# Deterministic (not random) so it's the same value across every environment without needing to
# persist/share it — was the literal string "default" before workspaces.id became a real uuid column.
DEFAULT_WORKSPACE_ID = str(uuid.uuid5(uuid.NAMESPACE_DNS, "fleetintel-default-workspace"))

# --- Email guardrails & sender (Resend) ---
RESEND_API_URL = "https://api.resend.com/emails"
CURRENCY_SYMBOLS = {
    "USD": "$", "ZAR": "R", "NGN": "₦", "KES": "KSh", "GHS": "GH₵",
    "EGP": "E£", "MAD": "DH", "TZS": "TSh", "UGX": "USh", "ETB": "Br",
}
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
    key = os.environ.get("RESEND_API_KEY")
    from_name = os.environ.get("EMAIL_FROM_NAME", "FleetCost Intelligence")
    # Resend's shared sandbox sender — works with zero setup, but Resend only delivers it to the
    # account owner's own signup address. Verify a real domain in Resend and set EMAIL_FROM_ADDRESS to
    # send to arbitrary recipients (every teammate's/customer's actual email).
    from_address = os.environ.get("EMAIL_FROM_ADDRESS", "onboarding@resend.dev")
    if not key:
        logger.warning("RESEND_API_KEY not set — skipping email")
        return None
    payload = {"from": f"{from_name} <{from_address}>", "to": [to], "subject": subject, "html": html}
    reply_to = os.environ.get("EMAIL_REPLY_TO")
    if reply_to: payload["reply_to"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(RESEND_API_URL,
                                     headers={"Authorization": f"Bearer {key}"}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return None

async def log_event(user: dict, action: str, entity_type: str, entity_id: str = "", meta: dict = None):
    """Record an audit event for the workspace."""
    try:
        await execute(
            "insert into audit_log (id, workspace_id, user_id, user_name, user_email, action, "
            "entity_type, entity_id, meta) values (:id, :ws, :uid, :uname, :uemail, :action, :etype, "
            ":eid, :meta ::jsonb)",
            id=str(uuid.uuid4()), ws=user.get("workspace_id", DEFAULT_WORKSPACE_ID),
            uid=user.get("id", ""), uname=user.get("name", ""), uemail=user.get("email", ""),
            action=action, etype=entity_type, eid=str(entity_id) if entity_id else "", meta=json_dumps(meta or {}),
        )
    except Exception as e:
        logger.error(f"audit log failed: {e}")

def _extract_bearer(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token

async def user_from_token(token: str) -> dict:
    """Verify a Supabase-issued access token (JWKS) and load the matching profile row."""
    try:
        payload = auth_supabase.verify_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await fetch_one(
        "select id, email, name, role, workspace_id, prefs, totp_enabled, created_at, permissions "
        "from user_profiles where id = :id",
        id=payload["sub"],
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_current_user(request: Request) -> dict:
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await user_from_token(token)

def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dep

_ACCESS_LEVELS = {"none": 0, "read": 1, "full": 2}

def require_module(module: str, level: str = "read"):
    """Enforces the System Rights matrix (permissions.modules) that Profiles have stored since the
    Teams pass but no route ever actually checked. Falls back to the role's PROFILE_PRESETS shape
    when the user has no customized permissions saved — same fallback TeamMemberPanel.jsx uses
    client-side when opening a member's Profile tab for the first time."""
    async def dep(user: dict = Depends(get_current_user)):
        modules = (user.get("permissions") or {}).get("modules") or {}
        user_level = modules.get(module)
        if user_level is None:
            user_level = PROFILE_PRESETS.get(user.get("role"), {}).get("modules", {}).get(module, "none")
        if _ACCESS_LEVELS.get(user_level, 0) < _ACCESS_LEVELS[level]:
            raise HTTPException(status_code=403, detail=f"Insufficient access to {module}")
        return user
    return dep

# --- Models ---
class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Optional[Literal["admin", "manager", "inspector", "mechanic", "operations_manager", "finance",
                            "workshop_head", "operations_staff", "finance_staff", "executive"]] = "manager"
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
    downtime_cost_per_hour: float = 0
    image_url: Optional[str] = None
    group_id: Optional[str] = None

class VehicleGroupIn(BaseModel):
    name: str
    color: Optional[str] = None
    fleet_type: Optional[str] = None
    branch: Optional[str] = None
    region: Optional[str] = None
    cost_centre: Optional[str] = None

class GroupAssign(BaseModel):
    add_ids: List[str] = []
    remove_ids: List[str] = []

class AssetIn(BaseModel):
    kind: Literal["asset", "trailer"] = "asset"
    name: str
    identifier: Optional[str] = ""
    category: Optional[str] = ""
    status: Literal["active", "maintenance", "idle"] = "active"
    group_id: Optional[str] = None

class AssetGroupIn(BaseModel):
    name: str
    color: Optional[str] = None
    category: Optional[str] = None
    branch: Optional[str] = None
    region: Optional[str] = None
    cost_centre: Optional[str] = None

class ChecklistItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    type: Literal["boolean", "rating", "text", "number"] = "boolean"
    required: bool = True
    photo_required: bool = False
    category: Optional[Literal["interior", "exterior", "trailer"]] = None
    icon: Optional[str] = None  # emoji string, or a data: URL once a real image is uploaded

class ChecklistSection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    items: List[ChecklistItem] = []
    icon: Optional[str] = None  # emoji string, or a data: URL once a real image is uploaded

class TemplateIn(BaseModel):
    name: str
    description: Optional[str] = ""
    sections: List[ChecklistSection] = []
    type: Literal["vehicle", "asset", "trailer"] = "vehicle"
    frequency: Optional[Literal["daily", "weekly", "each_trip", "monthly"]] = None
    assignment_scope: Literal["all", "group", "specific"] = "all"
    group_id: Optional[str] = None
    target_ids: List[str] = []
    active: bool = True

DEFECT_TYPES = {"tyres", "engine", "brakes", "electrical", "bodywork", "general"}  # mirrors maintenance.category

class InspectionAnswer(BaseModel):
    item_id: str
    value: str  # "pass", "fail", rating number, text
    note: Optional[str] = ""
    photo: Optional[str] = None  # base64 data URL
    defect_type: Optional[str] = None  # required when value == "fail", see DEFECT_TYPES

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
    role: Literal["manager", "inspector", "mechanic", "admin", "operations_manager", "finance",
                  "workshop_head", "operations_staff", "finance_staff", "executive"] = "manager"

class WorkspaceRename(BaseModel):
    name: Optional[str] = None
    license_warning_days: Optional[int] = None
    currency: Optional[str] = None
    notification_prefs: Optional[Dict[str, bool]] = None
    min_password_length: Optional[int] = None
    lockout_enabled: Optional[bool] = None
    lockout_threshold: Optional[int] = None
    report_logo: Optional[str] = None
    costing_approver_role: Optional[str] = None

class ReportDefinitionIn(BaseModel):
    name: str
    report_type: str
    file_type: Literal["pdf", "csv"] = "pdf"
    page_format: Literal["portrait", "landscape"] = "portrait"
    columns: List[str] = []
    filters: dict = {}

class ReportDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    file_type: Optional[Literal["pdf", "csv"]] = None
    page_format: Optional[Literal["portrait", "landscape"]] = None
    columns: Optional[List[str]] = None
    filters: Optional[dict] = None

class ReportPreviewIn(BaseModel):
    report_type: str
    columns: List[str] = []
    filters: dict = {}

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None

class PasswordResetComplete(BaseModel):
    token: str
    password: str

class LicenseCategory(BaseModel):
    category: str
    codes: Optional[str] = ""
    issue_date: Optional[str] = None
    expiration_date: Optional[str] = None

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
    group_id: Optional[str] = None
    number: Optional[str] = None
    company_department: Optional[str] = None
    cell_country_code: Optional[str] = None
    private: bool = False
    additional_info: Optional[str] = None
    app_access: dict = {"vehicle_checklist": False}
    identification_method: str = "vehicle_assignment"
    regulation: Optional[str] = None
    license_issuing_country: Optional[str] = None
    license_issuing_authority: Optional[str] = None
    license_issue_date: Optional[str] = None
    license_categories: List[LicenseCategory] = []
    address_country: Optional[str] = None
    address_street: Optional[str] = None
    address_zip: Optional[str] = None
    address_city: Optional[str] = None

class DriverGroupIn(BaseModel):
    name: str
    color: Optional[str] = None
    description: Optional[str] = None
    department: Optional[str] = None
    region: Optional[str] = None
    cost_centre: Optional[str] = None

class OCRIn(BaseModel):
    image_base64: str  # data URL or raw base64
    mode: Literal["plate", "odometer"] = "plate"

class TwoFAVerify(BaseModel):
    code: str

class LoginReq2FA(BaseModel):
    # str, not EmailStr: EmailStr's reserved-TLD rejection (.local/.test/.example) is correct for
    # registration but wrong for login — account validity is already established and Supabase's own
    # check is the real gate.
    email: str
    password: str
    code: Optional[str] = None

class InspectionIn(BaseModel):
    template_id: str
    vehicle_id: Optional[str] = None
    asset_id: Optional[str] = None
    answers: List[InspectionAnswer] = []
    notes: Optional[str] = ""
    odometer: Optional[float] = None
    completed_at: Optional[str] = None
    started_at: Optional[str] = None  # captured client-side when the checklist form was opened
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    location_status: Optional[Literal["captured", "denied", "unavailable", "not_attempted"]] = "not_attempted"
    signature: Optional[str] = None  # base64 data URL, captured on-device
    client_submission_id: Optional[str] = None  # idempotency key for retried mobile syncs

class MaintenanceIn(BaseModel):
    vehicle_id: Optional[str] = None
    asset_id: Optional[str] = None  # exactly one of vehicle_id/asset_id required — enforced in create_maintenance
    inspection_id: Optional[str] = None
    driver_id: Optional[str] = None
    schedule_id: Optional[str] = None  # set when this job was generated from a maintenance schedule
    title: str
    description: Optional[str] = ""
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    category: Optional[Literal["tyres", "engine", "brakes", "electrical", "bodywork", "general"]] = None
    estimated_cost: float = 0
    estimated_hours: float = 0
    assigned_to: Optional[str] = None  # mechanic user id
    parts_cost: float = 0
    labor_cost: float = 0
    odometer: Optional[float] = None  # required for vehicle jobs only (assets have no odometer) —
    # enforced in create_maintenance, not here, so an inspection-driven allocation that already
    # captured it can pass it straight through
    engine_hours: Optional[float] = None

class QuoteItem(BaseModel):
    type: Literal["part", "labour", "other"] = "part"
    description: str
    qty: float = 1
    unit_cost: float = 0
    vat_pct: float = 0

class QuoteAttachment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    file_name: str
    file_type: str
    file_size: int
    uploaded_by: str
    uploaded_at: str
    data_url: str  # base64 data URL — matches InspectionAnswer.photo / IncidentIn.photos

class QuoteIn(BaseModel):
    items: List[QuoteItem] = []
    attachments: List[QuoteAttachment] = []

class QuoteDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: Optional[str] = ""

class PurchaseOrderIn(BaseModel):
    supplier: Optional[str] = ""
    amount: float = 0
    notes: Optional[str] = ""
    maintenance_id: Optional[str] = None

class POMarkPaid(BaseModel):
    proof_of_payment: List[QuoteAttachment]

class PartRequisitionItem(BaseModel):
    part_id: str
    qty_requested: float

class PartRequisitionIn(BaseModel):
    items: List[PartRequisitionItem]
    client_submission_id: Optional[str] = None  # idempotency key for retried mobile syncs

class PartRequisitionDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: Optional[str] = ""

class TripLogIn(BaseModel):
    vehicle_id: str
    driver_id: Optional[str] = None
    occurred_at: str  # ISO datetime
    distance_km: float

class FuelLogIn(BaseModel):
    vehicle_id: str
    driver_id: Optional[str] = None
    occurred_at: str  # ISO datetime
    litres: float
    cost: float
    location: Optional[str] = ""
    odometer: Optional[float] = None

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

class EmailInsuranceReq(BaseModel):
    to_email: EmailStr
    note: Optional[str] = ""

DEFECT_PRICING_ROLES = ("workshop_head", "operations_manager", "finance", "admin")

class DefectIn(BaseModel):
    vehicle_id: Optional[str] = None
    category: Literal["tyres", "engine", "brakes", "electrical", "bodywork", "general"] = "general"
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    description: str
    location: Optional[str] = ""
    assigned_to: Optional[str] = None
    estimated_cost: float = 0
    client_submission_id: Optional[str] = None  # idempotency key for retried mobile syncs

class DefectUpdate(BaseModel):
    category: Optional[Literal["tyres", "engine", "brakes", "electrical", "bodywork", "general"]] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    description: Optional[str] = None
    location: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[Literal["open", "in_progress", "resolved"]] = None
    estimated_cost: Optional[float] = None
    resolution_notes: Optional[str] = None

class TileConfig(BaseModel):
    key: str
    threshold: Optional[float] = None
    view_by: Literal["none", "vehicle", "group", "driver"] = "none"
    group_id: Optional[str] = None
    chart_type: Literal["gauge", "bar", "line", "number"] = "gauge"
    period: Literal["7d", "30d", "90d", "6m", "12m", "all"] = "all"
    size: Literal["sm", "md", "lg"] = "md"

class UserPrefs(BaseModel):
    dashboard_tiles: Optional[List[TileConfig]] = None
    alert_sound_enabled: Optional[bool] = None

class MaintenanceUpdate(BaseModel):
    status: Optional[Literal["pending", "in_progress", "completed", "cancelled", "on_hold"]] = None
    actual_cost: Optional[float] = None
    parts_cost: Optional[float] = None
    labor_cost: Optional[float] = None
    # downtime_hours is intentionally not settable here — it's derived from started_at/completed_at
    # in update_maintenance below, not manual entry (was previously a trust-the-user free-text field).
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    # Completion meter readings (Feature 6) — feed the schedule's automatic reset when this job is
    # linked to a maintenance_schedule; harmless no-op for a plain one-off job.
    odometer: Optional[float] = None
    engine_hours: Optional[float] = None
    workshop_name: Optional[str] = None
    technician: Optional[str] = None
    vendor: Optional[str] = None
    external_cost: Optional[float] = None
    completion_documents: Optional[List[dict]] = None
    client_submission_id: Optional[str] = None  # idempotency key for retried mobile syncs

class MaintenancePhotoIn(BaseModel):
    name: str
    data: str  # base64 data URL, same inline convention as every other photo field in this app
    client_submission_id: Optional[str] = None  # idempotency key for retried mobile syncs

# --- App ---
app = FastAPI(title="FleetCost Intelligence API")
api = APIRouter(prefix="/api")

def now_iso(): return datetime.now(timezone.utc).isoformat()

def _parse_date(s):
    """asyncpg needs a native date/datetime object for date/timestamptz columns — a Postgres-side
    ::date or ::timestamptz cast doesn't help, since asyncpg encodes the parameter client-side
    before Postgres ever sees the cast."""
    if isinstance(s, date_cls):
        return s
    if not s:
        return None
    return datetime.strptime(s, "%Y-%m-%d").date()

def _parse_datetime(s):
    if not s or isinstance(s, datetime):
        return s
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))

# --- Auth routes ---
@api.post("/auth/register")
async def register(req: RegisterReq):
    email = req.email.lower()
    if await fetch_one("select 1 from user_profiles where email = :email", email=email):
        raise HTTPException(status_code=400, detail="Email already registered")

    # Resolve workspace via invite or new workspace
    role = req.role
    if req.invite_code:
        invite = await fetch_one(
            "select * from invites where code = :code and used_by is null", code=req.invite_code
        )
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid or used invite code")
        if invite.get("email") and invite["email"].lower() != email:
            raise HTTPException(status_code=400, detail="Invite email mismatch")
        workspace_id = invite["workspace_id"]
        role = invite.get("role") or role
        invite_permissions = invite.get("permissions") or PROFILE_PRESETS.get(role, {})
        target_ws = await fetch_one(
            "select min_password_length, costing_approver_role from workspaces where id = :id", id=workspace_id
        )
        min_password_length = (target_ws or {}).get("min_password_length") or 8
        # Workspaces with no dedicated Workshop Manager can designate another role as costing
        # approver (Settings -> costing_approver_role) -- apply it here so it takes effect on every
        # new hire automatically, not just the people already on the team when the setting was set.
        if target_ws and target_ws.get("costing_approver_role") == role:
            invite_permissions = {**invite_permissions, "modules": {**invite_permissions.get("modules", {}), "quotes": "full"}}
    else:
        invite_permissions = PROFILE_PRESETS.get(role, {})
        workspace_id = str(uuid.uuid4())
        min_password_length = 8  # no workspace row exists yet to read a configured minimum from

    if len(req.password) < min_password_length:
        raise HTTPException(status_code=400, detail=f"Password must be at least {min_password_length} characters")

    if not req.invite_code:
        await execute(
            "insert into workspaces (id, name, owner_email) values (:id, :name, :owner_email)",
            id=workspace_id, name=req.workspace_name or f"{req.name}'s Fleet", owner_email=email,
        )
        await _seed_default_taxonomies(workspace_id)

    try:
        supa_user = await auth_supabase.admin_create_user(email, req.password)
    except auth_supabase.SupabaseAuthError as e:
        raise HTTPException(status_code=e.status_code if e.status_code < 500 else 400, detail=e.detail)
    user_id = supa_user["id"]

    try:
        await execute(
            "insert into user_profiles (id, email, name, role, workspace_id, permissions) "
            "values (:id, :email, :name, :role, :workspace_id, :permissions ::jsonb)",
            id=user_id, email=email, name=req.name, role=role, workspace_id=workspace_id,
            permissions=json_dumps(invite_permissions),
        )
        if req.invite_code:
            await execute(
                "update invites set used_by = :uid, used_at = now() where code = :code",
                uid=user_id, code=req.invite_code,
            )
    except Exception:
        await auth_supabase.admin_delete_user(user_id)
        raise

    user = await fetch_one(
        "select id, email, name, role, workspace_id, prefs, totp_enabled, created_at "
        "from user_profiles where id = :id", id=user_id,
    )
    if req.invite_code:
        await log_event(user, "invite.accepted", "user", user_id, {"email": email, "role": role})

    session = await auth_supabase.password_sign_in(email, req.password)
    return {"user": user, "token": session["access_token"], "refresh_token": session["refresh_token"]}

LOCKOUT_COOLDOWN_MINUTES = 15

@api.post("/auth/login")
async def login(req: LoginReq2FA):
    email = req.email.lower()

    # Look up the profile by email BEFORE attempting Supabase sign-in, so a locked account can be
    # rejected without even trying the password (and so a failed attempt has a row to increment on).
    pre = await fetch_one(
        "select id, workspace_id, locked_until, failed_login_attempts from user_profiles where email = :email",
        email=email,
    )
    if pre and pre.get("locked_until") and pre["locked_until"] > datetime.now(timezone.utc):
        remaining = max(1, int((pre["locked_until"] - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
        raise HTTPException(status_code=423, detail=f"Account locked. Try again in {remaining} minute(s).")

    try:
        session = await auth_supabase.password_sign_in(email, req.password)
    except auth_supabase.SupabaseAuthError:
        if pre:
            ws = await fetch_one("select lockout_enabled, lockout_threshold from workspaces where id = :id", id=pre["workspace_id"])
            attempts = (pre.get("failed_login_attempts") or 0) + 1
            if ws and ws.get("lockout_enabled") and attempts >= (ws.get("lockout_threshold") or 5):
                await execute(
                    "update user_profiles set failed_login_attempts = 0, locked_until = :until where id = :id",
                    until=datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_COOLDOWN_MINUTES), id=pre["id"],
                )
            else:
                await execute("update user_profiles set failed_login_attempts = :n where id = :id", n=attempts, id=pre["id"])
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = await fetch_one(
        "select id, email, name, role, workspace_id, prefs, totp_enabled, totp_secret, created_at "
        "from user_profiles where id = :id", id=session["user"]["id"],
    )
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if pre and (pre.get("failed_login_attempts") or 0) > 0:
        await execute("update user_profiles set failed_login_attempts = 0, locked_until = null where id = :id", id=user["id"])

    if user["totp_enabled"]:
        if not req.code:
            return {"requires_2fa": True, "email": email}
        code = req.code.strip()
        totp = pyotp.TOTP(user["totp_secret"])
        totp_ok = len(code) == 6 and code.isdigit() and totp.verify(code, valid_window=1)
        recovery_used = False
        if not totp_ok and len(code) >= 8:
            matched = await fetch_one(
                "select id from recovery_codes where user_id = :uid and used = false and upper(code) = :code",
                uid=user["id"], code=code.upper(),
            )
            if matched:
                await execute(
                    "update recovery_codes set used = true, used_at = now() where id = :id", id=matched["id"],
                )
                recovery_used = True
                totp_ok = True
        if not totp_ok:
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
        user.pop("totp_secret", None)
        resp = {"user": user, "token": session["access_token"], "refresh_token": session["refresh_token"]}
        if recovery_used: resp["recovery_used"] = True
        return resp

    user.pop("totp_secret", None)
    return {"user": user, "token": session["access_token"], "refresh_token": session["refresh_token"]}

class RefreshReq(BaseModel):
    refresh_token: str

@api.post("/auth/refresh")
async def refresh_token(req: RefreshReq):
    try:
        session = await auth_supabase.refresh_session(req.refresh_token)
    except auth_supabase.SupabaseAuthError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    return {
        "token": session["access_token"],
        "refresh_token": session["refresh_token"],
        "expires_in": session.get("expires_in"),
    }

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
    await execute("update user_profiles set totp_pending_secret = :s where id = :id", s=secret, id=user["id"])
    return {"secret": secret, "uri": uri, "qr": qr_data_url, "issuer": issuer}

@api.post("/auth/2fa/enable")
async def twofa_enable(req: TwoFAVerify, user: dict = Depends(get_current_user)):
    u = await fetch_one("select totp_pending_secret from user_profiles where id = :id", id=user["id"])
    secret = u and u.get("totp_pending_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="No pending 2FA setup. Call /2fa/setup first.")
    totp = pyotp.TOTP(secret)
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    # Generate 8 recovery codes
    codes = [secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10].upper() for _ in range(8)]
    await execute(
        "update user_profiles set totp_secret = :s, totp_enabled = true, totp_pending_secret = null where id = :id",
        s=secret, id=user["id"],
    )
    await execute_many(
        "insert into recovery_codes (user_id, code) values (:uid, :code)",
        [{"uid": user["id"], "code": c} for c in codes],
    )
    await log_event(user, "2fa.enabled", "user", user["id"])
    return {"enabled": True, "recovery_codes": codes}

@api.post("/auth/2fa/regenerate-recovery")
async def twofa_regen_recovery(req: TwoFAVerify, user: dict = Depends(get_current_user)):
    u = await fetch_one("select totp_enabled, totp_secret from user_profiles where id = :id", id=user["id"])
    if not u or not u["totp_enabled"]:
        raise HTTPException(status_code=400, detail="2FA not enabled")
    totp = pyotp.TOTP(u["totp_secret"])
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    codes = [secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10].upper() for _ in range(8)]
    await execute("delete from recovery_codes where user_id = :uid", uid=user["id"])
    await execute_many(
        "insert into recovery_codes (user_id, code) values (:uid, :code)",
        [{"uid": user["id"], "code": c} for c in codes],
    )
    return {"recovery_codes": codes}

@api.get("/auth/2fa/recovery-status")
async def twofa_recovery_status(user: dict = Depends(get_current_user)):
    codes = await fetch_all("select used from recovery_codes where user_id = :uid", uid=user["id"])
    return {"total": len(codes), "unused": sum(1 for c in codes if not c["used"])}

@api.post("/auth/2fa/disable")
async def twofa_disable(req: TwoFAVerify, user: dict = Depends(get_current_user)):
    u = await fetch_one("select totp_enabled, totp_secret from user_profiles where id = :id", id=user["id"])
    if not u or not u["totp_enabled"]:
        return {"enabled": False}
    totp = pyotp.TOTP(u["totp_secret"])
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    await execute(
        "update user_profiles set totp_enabled = false, totp_secret = null, totp_pending_secret = null "
        "where id = :id", id=user["id"],
    )
    await log_event(user, "2fa.disabled", "user", user["id"])
    return {"enabled": False}

@api.get("/auth/2fa/status")
async def twofa_status(user: dict = Depends(get_current_user)):
    u = await fetch_one("select totp_enabled from user_profiles where id = :id", id=user["id"])
    return {"enabled": bool(u and u["totp_enabled"])}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}

MODULE_KEYS = ["dashboard", "fleet", "assets", "drivers", "incidents", "vehicle_checklist",
               "templates", "maintenance", "parts", "team", "audit", "reports", "security",
               "purchase_orders", "defects", "executive_dashboard", "parts_requisitions", "quotes"]

def _default_permissions(role: str) -> dict:
    """Pre-fills System Rights from a Profile (role). Enforced on routes via require_module()."""
    full = {m: "full" for m in MODULE_KEYS}
    read_all = {m: "read" for m in MODULE_KEYS}
    if role == "admin":
        modules = full
    elif role == "manager":
        modules = {**full, "security": "read", "team": "read"}
    elif role == "inspector":
        modules = {**read_all, "vehicle_checklist": "full", "templates": "full", "fleet": "read", "executive_dashboard": "none"}
    elif role == "mechanic":
        modules = {**read_all, "maintenance": "full", "parts": "full", "defects": "full", "parts_requisitions": "full", "executive_dashboard": "none"}
    elif role == "operations_manager":
        modules = {**read_all, "maintenance": "full", "parts": "full", "fleet": "full", "reports": "full", "defects": "full", "executive_dashboard": "none"}
    elif role == "finance":
        # Finance explicitly gets executive_dashboard visibility (per product decision) — it's not
        # part of read_all's blanket grant since most other roles above are deliberately excluded.
        modules = {**read_all, "parts": "full", "reports": "full", "purchase_orders": "full", "executive_dashboard": "read"}
    elif role == "workshop_head":
        modules = {**read_all, "maintenance": "full", "purchase_orders": "read", "parts": "read", "fleet": "read", "defects": "full", "parts_requisitions": "full", "quotes": "full", "executive_dashboard": "none"}
    elif role == "operations_staff":
        modules = {**read_all, "maintenance": "full", "vehicle_checklist": "full", "templates": "full",
                   "parts": "full", "purchase_orders": "read", "defects": "full", "executive_dashboard": "none"}
    elif role == "finance_staff":
        modules = {**read_all, "parts": "read", "reports": "read", "purchase_orders": "read",
                   "maintenance": "read", "vehicle_checklist": "read", "templates": "read", "executive_dashboard": "none"}
    elif role == "executive":
        # Pure oversight — full visibility everywhere, no write access anywhere. For CEO/COO-level
        # profiles: they need to see everything to make decisions, but shouldn't be editing records.
        modules = read_all
    else:
        modules = {m: "none" for m in MODULE_KEYS}
    return {
        "modules": modules,
        # Data-level scope, orthogonal to the module (none/read/full) permissions above — empty lists
        # mean unrestricted (the existing "All" fallback the Team panel already displays), matching
        # every preset's default of full visibility until an admin narrows a specific user down.
        "vehicle_group_ids": [], "vehicle_ids": [],
        "asset_group_ids": [], "asset_ids": [],
        "driver_group_ids": [], "trip_data_access": True, "address_access": True,
    }

PROFILE_PRESETS = {role: _default_permissions(role) for role in
                    ("admin", "manager", "inspector", "mechanic", "operations_manager", "finance",
                     "workshop_head", "operations_staff", "finance_staff", "executive")}

# --- Vehicle/asset visibility scoping ---
# A second, data-level axis on top of the module (none/read/full) permissions above: which specific
# vehicles/assets (and everything keyed to them — maintenance, inspections, incidents, defects, fuel
# logs, trip logs, and every cost/health/compliance analytics rollup) a user is allowed to see at all.
# Configured per-user in the Team panel via permissions.vehicle_group_ids/vehicle_ids (and the asset_
# equivalents); empty on both means unrestricted. Admin always bypasses regardless of what's stored on
# their own account, so an admin can never lock themselves out of part of their own fleet.
async def _resolve_scope(user: dict, kind: str):
    """Returns the set of allowed ids for kind in ("vehicle", "asset"), or None if this user is
    unrestricted for that kind (admin, or no scope configured) — None means "don't filter"."""
    if user.get("role") == "admin":
        return None
    perms = user.get("permissions") or {}
    group_ids = perms.get(f"{kind}_group_ids") or []
    explicit_ids = perms.get(f"{kind}_ids") or []
    if not group_ids and not explicit_ids:
        return None
    allowed = set(explicit_ids)
    if group_ids:
        table = "vehicles" if kind == "vehicle" else "assets"
        rows = await fetch_all(
            f"select id from {table} where workspace_id = :ws and group_id = any(:gids)",
            ws=user["workspace_id"], gids=group_ids,
        )
        allowed |= {str(r["id"]) for r in rows}
    return allowed

async def _resolve_full_scope(user: dict):
    """Convenience: resolves both kinds at once — the shape almost every vehicle/asset-linked
    endpoint needs (a row is in-scope if its vehicle_id is allowed OR its asset_id is allowed)."""
    return await _resolve_scope(user, "vehicle"), await _resolve_scope(user, "asset")

def _scope_filter(rows: list, allowed_vehicles, allowed_assets, vehicle_field="vehicle_id", asset_field="asset_id") -> list:
    """Filters `rows` down to ones the caller's scope allows. `vehicle_field`/`asset_field` name
    which key on each row identifies the vehicle/asset — pass vehicle_field="id", asset_field=None
    to filter a vehicles-table result set directly (the row's own id IS the vehicle id), and the
    mirror image for an assets-table result set. A row with neither an in-play vehicle nor asset
    reference passes through unfiltered — scoping only ever narrows rows that actually name a
    vehicle/asset, never data that isn't tied to one at all."""
    if allowed_vehicles is None and allowed_assets is None:
        return rows
    out = []
    for r in rows:
        vid = r.get(vehicle_field) if vehicle_field else None
        aid = r.get(asset_field) if asset_field else None
        if vid is not None:
            if allowed_vehicles is None or str(vid) in allowed_vehicles:
                out.append(r)
        elif aid is not None:
            if allowed_assets is None or str(aid) in allowed_assets:
                out.append(r)
        else:
            out.append(r)
    return out

USER_COLS = {"name", "username", "company_department", "cell", "additional_info", "status",
             "active_from", "active_until", "permissions", "role", "account_type"}

SAFE_USER_COLS = (
    "id, email, name, role, workspace_id, prefs, totp_enabled, created_at, username, "
    "company_department, cell, additional_info, status, active_from, active_until, permissions, account_type, "
    "locked_until"
)  # excludes totp_secret/totp_pending_secret — raw 2FA seeds must never reach another user's browser

@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    return await fetch_all(
        f"select {SAFE_USER_COLS} from user_profiles where workspace_id = :ws",
        ws=user["workspace_id"],
    )

@api.get("/permissions/presets")
async def get_permission_presets(user: dict = Depends(get_current_user)):
    return {"module_keys": MODULE_KEYS, "presets": PROFILE_PRESETS}

@api.patch("/users/me")
async def update_my_profile(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    """Self-service edit of the caller's own name/email — distinct from the admin-only PATCH
    /users/{uid} below, which can edit any teammate but isn't meant for editing yourself. Must be
    registered before /users/{uid} — FastAPI matches path routes in registration order, and
    /users/{uid} would otherwise swallow this as a request for a user literally named "me"."""
    if req.email is not None and req.email.lower() != user["email"].lower():
        existing = await fetch_one("select id from user_profiles where lower(email) = :e and id != :id", e=req.email.lower(), id=user["id"])
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        try:
            await auth_supabase.admin_update_user_email(user["id"], req.email)
        except auth_supabase.SupabaseAuthError as e:
            raise HTTPException(status_code=e.status_code, detail=e.detail)
        await execute("update user_profiles set email = :e where id = :id", e=req.email.lower(), id=user["id"])
    if req.name is not None and req.name.strip():
        await execute("update user_profiles set name = :n where id = :id", n=req.name.strip(), id=user["id"])
    doc = await fetch_one(f"select {SAFE_USER_COLS} from user_profiles where id = :id", id=user["id"])
    await log_event(user, "user.self_updated", "user", user["id"], {"fields": [k for k, v in req.model_dump(exclude_unset=True).items() if v is not None]})
    return doc

@api.patch("/users/{uid}")
async def update_user(uid: str, patch: dict, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await fetch_one("select * from user_profiles where id = :id and workspace_id = :ws", id=uid, ws=user["workspace_id"])
    if not target: raise HTTPException(status_code=404, detail="Not found")
    await update_row("user_profiles", uid, user["workspace_id"], patch, USER_COLS)
    doc = await fetch_one(f"select {SAFE_USER_COLS} from user_profiles where id = :id", id=uid)
    await log_event(user, "user.updated", "user", uid, {"name": doc["name"], "fields": list(patch.keys())})
    return doc

@api.post("/users/{uid}/deactivate")
async def deactivate_user(uid: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await fetch_one("select * from user_profiles where id = :id and workspace_id = :ws", id=uid, ws=user["workspace_id"])
    if not target: raise HTTPException(status_code=404, detail="Not found")
    await execute("update user_profiles set status = 'inactive' where id = :id", id=uid)
    await log_event(user, "user.deactivated", "user", uid, {"name": target["name"]})
    return await fetch_one(f"select {SAFE_USER_COLS} from user_profiles where id = :id", id=uid)

PASSWORD_RESET_TTL_MINUTES = 15

@api.post("/users/{uid}/reset-password")
async def reset_user_password(uid: str, user: dict = Depends(get_current_user)):
    """Admin/manager-triggered reset: emails the target's address on file (never the caller's) a
    first-party link that expires in PASSWORD_RESET_TTL_MINUTES. Uses our own token table rather than
    Supabase's hosted /recover flow, whose link expiry is a project-level setting we can't override
    per-request via the service-role API."""
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await fetch_one("select * from user_profiles where id = :id and workspace_id = :ws", id=uid, ws=user["workspace_id"])
    if not target: raise HTTPException(status_code=404, detail="Not found")

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    await execute(
        "insert into password_resets (id, user_id, token_hash, expires_at) values (:id, :uid, :hash, :exp)",
        id=str(uuid.uuid4()), uid=uid, hash=token_hash,
        exp=datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES),
    )
    ws = await fetch_one("select name from workspaces where id = :id", id=user["workspace_id"]) or {"name": "Fleet"}
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    from_name = os.environ.get("EMAIL_FROM_NAME", "FleetIntel")
    html = (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#0f172a">'
        f'<tr><td style="padding:24px;border-bottom:3px solid #0EA5E9">'
        f'<div style="font-size:12px;letter-spacing:0.2em;color:#64748b;text-transform:uppercase">{escape(ws["name"])}</div>'
        f'<h1 style="margin:8px 0 0 0;font-size:22px">Reset your password</h1></td></tr>'
        f'<tr><td style="padding:24px">'
        f'<p style="margin:0 0 16px 0">An administrator requested a password reset for your {escape(from_name)} account ({escape(target["email"])}).</p>'
        f'<p style="margin:0 0 20px 0"><a href="{escape(link)}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px">Choose a new password</a></p>'
        f'<p style="margin:0;font-size:13px;color:#64748b">This link expires in {PASSWORD_RESET_TTL_MINUTES} minutes and can only be used once. If you didn\'t expect this, you can ignore this email — your password won\'t change.</p>'
        f'<p style="margin:16px 0 0 0;font-size:12px;color:#888">Sent by {escape(from_name)}. We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )
    email_id = await send_email(to=target["email"], subject=f"Reset your {from_name} password", html=html)
    await log_event(user, "user.password_reset", "user", uid, {"name": target["name"]})
    return {"ok": True, "email_id": email_id}

@api.post("/auth/reset-password")
async def complete_password_reset(req: PasswordResetComplete):
    """Public endpoint — the target of the emailed link. No auth required, since the token itself IS
    the credential; validated single-use + time-limited."""
    token_hash = hashlib.sha256(req.token.encode()).hexdigest()
    row = await fetch_one("select * from password_resets where token_hash = :h", h=token_hash)
    if not row or row["used_at"] or row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")
    target = await fetch_one("select * from user_profiles where id = :id", id=row["user_id"])
    if not target:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")
    ws = await fetch_one("select min_password_length from workspaces where id = :id", id=target["workspace_id"])
    min_length = (ws or {}).get("min_password_length") or 8
    if len(req.password) < min_length:
        raise HTTPException(status_code=400, detail=f"Password must be at least {min_length} characters")

    await auth_supabase.admin_set_password(str(target["id"]), req.password)
    await execute("update password_resets set used_at = now() where id = :id", id=row["id"])
    # A successful password change is also a legitimate reason to clear any active lockout.
    await execute("update user_profiles set failed_login_attempts = 0, locked_until = null where id = :id", id=target["id"])
    await log_event(target, "user.password_reset_completed", "user", str(target["id"]), {})
    return {"ok": True}

@api.post("/users/{uid}/unlock")
async def unlock_user(uid: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await fetch_one("select * from user_profiles where id = :id and workspace_id = :ws", id=uid, ws=user["workspace_id"])
    if not target: raise HTTPException(status_code=404, detail="Not found")
    await execute("update user_profiles set failed_login_attempts = 0, locked_until = null where id = :id", id=uid)
    await log_event(user, "user.unlocked", "user", uid, {"name": target["name"]})
    return await fetch_one(f"select {SAFE_USER_COLS} from user_profiles where id = :id", id=uid)

@api.post("/users/{uid}/duplicate")
async def duplicate_user(uid: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Forbidden")
    src = await fetch_one("select * from user_profiles where id = :id and workspace_id = :ws", id=uid, ws=user["workspace_id"])
    if not src: raise HTTPException(status_code=404, detail="Not found")
    iid = str(uuid.uuid4())
    code = secrets.token_urlsafe(12)
    await execute(
        "insert into invites (id, workspace_id, code, email, role, created_by, invitee_name, permissions) "
        "values (:id, :ws, :code, :email, :role, :created_by, :name, :permissions ::jsonb)",
        id=iid, ws=user["workspace_id"], code=code, email=f"copy-of-{src['email']}",
        role=src["role"], created_by=user["id"], name=f"{src['name']} (copy)",
        permissions=json_dumps(src.get("permissions") or {}),
    )
    doc = await fetch_one("select * from invites where id = :id", id=iid)
    await log_event(user, "user.duplicated", "user", uid, {"name": src["name"]})
    return doc

@api.delete("/users/{uid}")
async def delete_user(uid: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can remove team members")
    target = await fetch_one("select * from user_profiles where id = :id and workspace_id = :ws", id=uid, ws=user["workspace_id"])
    if not target: raise HTTPException(status_code=404, detail="Not found")
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    await execute("delete from user_profiles where id = :id and workspace_id = :ws", id=uid, ws=user["workspace_id"])
    await log_event(user, "user.deleted", "user", uid, {"name": target["name"]})
    return {"ok": True}

@api.get("/users/me/prefs")
async def get_my_prefs(user: dict = Depends(get_current_user)):
    u = await fetch_one("select prefs from user_profiles where id = :id", id=user["id"])
    return (u or {}).get("prefs") or {}

@api.put("/users/me/prefs")
async def put_my_prefs(p: UserPrefs, user: dict = Depends(get_current_user)):
    patch = {k: v for k, v in p.model_dump(exclude_unset=True).items() if v is not None}
    if patch:
        await execute(
            "update user_profiles set prefs = coalesce(prefs, '{}'::jsonb) || :patch ::jsonb where id = :id",
            patch=json_dumps(patch), id=user["id"],
        )
    u = await fetch_one("select prefs from user_profiles where id = :id", id=user["id"])
    return (u or {}).get("prefs") or {}

VEHICLE_COLS = {"name", "plate", "make", "model", "year", "type", "status", "odometer",
                 "fuel_cost_per_km", "downtime_cost_per_hour", "image_url", "group_id"}

VEHICLE_GROUP_COLS = {"name", "color", "fleet_type", "branch", "region", "cost_centre"}

# --- Vehicle groups ---
@api.get("/vehicle-groups")
async def list_vehicle_groups(user: dict = Depends(get_current_user)):
    return await fetch_all("select * from vehicle_groups where workspace_id = :ws order by name", ws=user["workspace_id"])

@api.post("/vehicle-groups")
async def create_vehicle_group(g: VehicleGroupIn, user: dict = Depends(get_current_user)):
    gid = str(uuid.uuid4())
    await execute(
        "insert into vehicle_groups (id, workspace_id, name, color, fleet_type, branch, region, cost_centre) "
        "values (:id, :ws, :name, :color, :fleet_type, :branch, :region, :cost_centre)",
        id=gid, ws=user["workspace_id"], **g.model_dump(),
    )
    doc = await fetch_one("select * from vehicle_groups where id = :id", id=gid)
    await log_event(user, "vehicle_group.created", "vehicle_group", gid, {"name": doc["name"]})
    return doc

@api.patch("/vehicle-groups/{gid}")
async def update_vehicle_group(gid: str, patch: dict, user: dict = Depends(get_current_user)):
    before = await fetch_one("select * from vehicle_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if not before: raise HTTPException(status_code=404, detail="Not found")
    await update_row("vehicle_groups", gid, user["workspace_id"], patch, VEHICLE_GROUP_COLS)
    doc = await fetch_one("select * from vehicle_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if "color" in patch and patch["color"] != before["color"]:
        await log_event(user, "vehicle_group.color_changed", "vehicle_group", gid, {"name": doc["name"], "from": before["color"], "to": doc["color"]})
    else:
        await log_event(user, "vehicle_group.updated", "vehicle_group", gid, {"name": doc["name"]})
    return doc

@api.delete("/vehicle-groups/{gid}")
async def delete_vehicle_group(gid: str, user: dict = Depends(get_current_user)):
    g = await fetch_one("select * from vehicle_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    await execute("delete from vehicle_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if g:
        await log_event(user, "vehicle_group.deleted", "vehicle_group", gid, {"name": g["name"]})
    return {"ok": True}

@api.post("/vehicle-groups/{gid}/assign")
async def assign_vehicle_group(gid: str, body: GroupAssign, user: dict = Depends(get_current_user)):
    g = await fetch_one("select * from vehicle_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if not g: raise HTTPException(status_code=404, detail="Not found")
    if body.add_ids:
        await execute(
            "update vehicles set group_id = :gid where id = any(:ids) and workspace_id = :ws",
            gid=gid, ids=body.add_ids, ws=user["workspace_id"],
        )
        await log_event(user, "vehicle_group.member_added", "vehicle_group", gid, {"name": g["name"], "count": len(body.add_ids), "ids": body.add_ids})
    if body.remove_ids:
        await execute(
            "update vehicles set group_id = null where id = any(:ids) and group_id = :gid and workspace_id = :ws",
            gid=gid, ids=body.remove_ids, ws=user["workspace_id"],
        )
        await log_event(user, "vehicle_group.member_removed", "vehicle_group", gid, {"name": g["name"], "count": len(body.remove_ids), "ids": body.remove_ids})
    return {"ok": True}

@api.get("/vehicle-groups/{gid}/analysis")
async def vehicle_group_analysis(gid: str, user: dict = Depends(get_current_user)):
    ws = user["workspace_id"]
    g = await fetch_one("select * from vehicle_groups where id = :id and workspace_id = :ws", id=gid, ws=ws)
    if not g: raise HTTPException(status_code=404, detail="Not found")
    vehicles = await fetch_all("select * from vehicles where workspace_id = :ws and group_id = :gid order by name", ws=ws, gid=gid)
    vids = [v["id"] for v in vehicles]
    driver_count = 0
    fuel_cost = maintenance_cost = tyre_cost = 0.0
    if vids:
        driver_count = (await fetch_one(
            "select count(*) as c from drivers where workspace_id = :ws and assigned_vehicle_id = any(:ids)", ws=ws, ids=vids,
        ))["c"]
        fuel_rows = await fetch_all(
            "select coalesce(sum(cost), 0) as total from fuel_logs where workspace_id = :ws and vehicle_id = any(:ids)", ws=ws, ids=vids,
        )
        fuel_cost = float(fuel_rows[0]["total"] or 0)
        maint_rows = await fetch_all(
            "select coalesce(sum(actual_cost), 0) as total from maintenance where workspace_id = :ws and vehicle_id = any(:ids) and status = 'completed'",
            ws=ws, ids=vids,
        )
        maintenance_cost = float(maint_rows[0]["total"] or 0)
        tyre_rows = await fetch_all(
            "select coalesce(sum(actual_cost), 0) as total from maintenance where workspace_id = :ws and vehicle_id = any(:ids) "
            "and status = 'completed' and category = 'tyres'",
            ws=ws, ids=vids,
        )
        tyre_cost = float(tyre_rows[0]["total"] or 0)
    return {
        "group": g,
        "vehicle_count": len(vehicles),
        "driver_count": driver_count,
        "fuel_cost": round(fuel_cost, 2),
        "maintenance_cost": round(maintenance_cost, 2),
        "tyre_cost": round(tyre_cost, 2),
        "vehicles": vehicles,
    }

# --- Asset groups ---
ASSET_GROUP_COLS = {"name", "color", "category", "branch", "region", "cost_centre"}

@api.get("/asset-groups")
async def list_asset_groups(user: dict = Depends(get_current_user)):
    return await fetch_all("select * from asset_groups where workspace_id = :ws order by name", ws=user["workspace_id"])

@api.post("/asset-groups")
async def create_asset_group(g: AssetGroupIn, user: dict = Depends(get_current_user)):
    gid = str(uuid.uuid4())
    await execute(
        "insert into asset_groups (id, workspace_id, name, color, category, branch, region, cost_centre) "
        "values (:id, :ws, :name, :color, :category, :branch, :region, :cost_centre)",
        id=gid, ws=user["workspace_id"], **g.model_dump(),
    )
    doc = await fetch_one("select * from asset_groups where id = :id", id=gid)
    await log_event(user, "asset_group.created", "asset_group", gid, {"name": doc["name"]})
    return doc

@api.patch("/asset-groups/{gid}")
async def update_asset_group(gid: str, patch: dict, user: dict = Depends(get_current_user)):
    before = await fetch_one("select * from asset_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if not before: raise HTTPException(status_code=404, detail="Not found")
    await update_row("asset_groups", gid, user["workspace_id"], patch, ASSET_GROUP_COLS)
    doc = await fetch_one("select * from asset_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if "color" in patch and patch["color"] != before["color"]:
        await log_event(user, "asset_group.color_changed", "asset_group", gid, {"name": doc["name"], "from": before["color"], "to": doc["color"]})
    else:
        await log_event(user, "asset_group.updated", "asset_group", gid, {"name": doc["name"]})
    return doc

@api.delete("/asset-groups/{gid}")
async def delete_asset_group(gid: str, user: dict = Depends(get_current_user)):
    g = await fetch_one("select * from asset_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    await execute("delete from asset_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if g:
        await log_event(user, "asset_group.deleted", "asset_group", gid, {"name": g["name"]})
    return {"ok": True}

@api.post("/asset-groups/{gid}/assign")
async def assign_asset_group(gid: str, body: GroupAssign, user: dict = Depends(get_current_user)):
    g = await fetch_one("select * from asset_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if not g: raise HTTPException(status_code=404, detail="Not found")
    if body.add_ids:
        await execute(
            "update assets set group_id = :gid where id = any(:ids) and workspace_id = :ws",
            gid=gid, ids=body.add_ids, ws=user["workspace_id"],
        )
        await log_event(user, "asset_group.member_added", "asset_group", gid, {"name": g["name"], "count": len(body.add_ids), "ids": body.add_ids})
    if body.remove_ids:
        await execute(
            "update assets set group_id = null where id = any(:ids) and group_id = :gid and workspace_id = :ws",
            gid=gid, ids=body.remove_ids, ws=user["workspace_id"],
        )
        await log_event(user, "asset_group.member_removed", "asset_group", gid, {"name": g["name"], "count": len(body.remove_ids), "ids": body.remove_ids})
    return {"ok": True}

# --- Assets & trailers (lightweight inspectable targets, no maintenance/fuel lifecycle) ---
ASSET_COLS = {"name", "identifier", "category", "status", "group_id"}

@api.get("/assets")
async def list_assets(kind: Optional[str] = None, search: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = "select * from assets where workspace_id = :ws"
    params = {"ws": user["workspace_id"]}
    if kind:
        q += " and kind = :kind"
        params["kind"] = kind
    if search:
        q += " and name ilike :q"
        params["q"] = f"%{search}%"
    q += " order by name"
    rows = await fetch_all(q, **params)
    allowed_assets = await _resolve_scope(user, "asset")
    return _scope_filter(rows, None, allowed_assets, vehicle_field=None, asset_field="id")

@api.post("/assets")
async def create_asset(a: AssetIn, user: dict = Depends(get_current_user)):
    aid = str(uuid.uuid4())
    await execute(
        "insert into assets (id, workspace_id, kind, name, identifier, category, status, group_id) "
        "values (:id, :ws, :kind, :name, :identifier, :category, :status, :group_id)",
        id=aid, ws=user["workspace_id"], **a.model_dump(),
    )
    doc = await fetch_one("select * from assets where id = :id", id=aid)
    await log_event(user, "asset.created", "asset", aid, {"name": doc["name"], "kind": doc["kind"]})
    return doc

@api.get("/assets/{aid}")
async def get_asset(aid: str, user: dict = Depends(get_current_user)):
    a = await fetch_one("select * from assets where id = :id and workspace_id = :ws", id=aid, ws=user["workspace_id"])
    if not a: raise HTTPException(status_code=404, detail="Not found")
    allowed_assets = await _resolve_scope(user, "asset")
    if allowed_assets is not None and str(aid) not in allowed_assets:
        raise HTTPException(status_code=404, detail="Not found")
    return a

@api.patch("/assets/{aid}")
async def update_asset(aid: str, patch: dict, user: dict = Depends(get_current_user)):
    await update_row("assets", aid, user["workspace_id"], patch, ASSET_COLS)
    return await fetch_one("select * from assets where id = :id and workspace_id = :ws", id=aid, ws=user["workspace_id"])

@api.delete("/assets/{aid}")
async def delete_asset(aid: str, user: dict = Depends(get_current_user)):
    await execute("delete from assets where id = :id and workspace_id = :ws", id=aid, ws=user["workspace_id"])
    return {"ok": True}

# --- Vehicles ---
@api.get("/vehicles")
async def list_vehicles(search: Optional[str] = None, limit: Optional[int] = None, offset: int = 0, user: dict = Depends(get_current_user)):
    if search:
        q = "select * from vehicles where workspace_id = :ws and (name ilike :q or plate ilike :q) order by name"
        params = {"ws": user["workspace_id"], "q": f"%{search}%"}
    else:
        q = "select * from vehicles where workspace_id = :ws order by name"
        params = {"ws": user["workspace_id"]}
    rows = await fetch_all(q, **params)
    allowed_vehicles = await _resolve_scope(user, "vehicle")
    rows = _scope_filter(rows, allowed_vehicles, None, vehicle_field="id", asset_field=None)
    # limit/offset applied after scoping, not in SQL — otherwise a scoped user could get back fewer
    # than `limit` rows (or an empty page) even when more scope-visible rows exist past the SQL-level
    # window, since the DB has no idea which rows this user's scope will keep.
    if limit is not None:
        rows = rows[offset:offset + limit]
    return rows

@api.post("/vehicles")
async def create_vehicle(v: VehicleIn, user: dict = Depends(get_current_user)):
    vid = str(uuid.uuid4())
    await execute(
        "insert into vehicles (id, workspace_id, name, plate, make, model, year, type, status, "
        "odometer, fuel_cost_per_km, downtime_cost_per_hour, image_url, group_id) values (:id, :ws, :name, :plate, :make, :model, "
        ":year, :type, :status, :odometer, :fuel_cost_per_km, :downtime_cost_per_hour, :image_url, :group_id)",
        id=vid, ws=user["workspace_id"], **v.model_dump(),
    )
    doc = await fetch_one("select * from vehicles where id = :id", id=vid)
    await log_event(user, "vehicle.created", "vehicle", vid, {"name": doc["name"], "plate": doc["plate"]})
    return doc

@api.get("/vehicles/{vid}")
async def get_vehicle(vid: str, user: dict = Depends(get_current_user)):
    v = await fetch_one("select * from vehicles where id = :id and workspace_id = :ws", id=vid, ws=user["workspace_id"])
    if not v: raise HTTPException(status_code=404, detail="Not found")
    allowed_vehicles = await _resolve_scope(user, "vehicle")
    if allowed_vehicles is not None and str(vid) not in allowed_vehicles:
        raise HTTPException(status_code=404, detail="Not found")
    return v

@api.patch("/vehicles/{vid}")
async def update_vehicle(vid: str, patch: dict, user: dict = Depends(get_current_user)):
    await update_row("vehicles", vid, user["workspace_id"], patch, VEHICLE_COLS)
    return await fetch_one("select * from vehicles where id = :id and workspace_id = :ws", id=vid, ws=user["workspace_id"])

@api.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user: dict = Depends(get_current_user)):
    await execute("delete from vehicles where id = :id and workspace_id = :ws", id=vid, ws=user["workspace_id"])
    return {"ok": True}

TEMPLATE_COLS = {"name", "description", "sections", "type", "frequency", "assignment_scope",
                  "group_id", "target_ids", "active"}

# --- Templates ---
@api.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    # Only the current version of each template family — superseded versions stay queryable by id
    # (e.g. for historical reports) but drop out of the assignment/picker list.
    return await fetch_all("select * from templates where workspace_id = :ws and active = true", ws=user["workspace_id"])

@api.post("/templates")
async def create_template(t: TemplateIn, user: dict = Depends(get_current_user)):
    tid = str(uuid.uuid4())
    sections = [s.model_dump() for s in t.sections]
    await execute(
        "insert into templates (id, workspace_id, name, description, sections, type, frequency, "
        "assignment_scope, group_id, target_ids, active, created_by, version, family_id) values (:id, :ws, :name, "
        ":description, :sections ::jsonb, :type, :frequency, :assignment_scope, :group_id, "
        ":target_ids ::jsonb, :active, :created_by, 1, :id)",
        id=tid, ws=user["workspace_id"], name=t.name, description=t.description,
        sections=json_dumps(sections), type=t.type, frequency=t.frequency,
        assignment_scope=t.assignment_scope, group_id=t.group_id,
        target_ids=json_dumps(t.target_ids), active=t.active, created_by=user["id"],
    )
    doc = await fetch_one("select * from templates where id = :id", id=tid)
    await log_event(user, "template.created", "template", tid, {"name": doc["name"]})
    return doc

@api.post("/templates/{tid}/duplicate")
async def duplicate_template(tid: str, user: dict = Depends(get_current_user)):
    src = await fetch_one("select * from templates where id = :id and workspace_id = :ws", id=tid, ws=user["workspace_id"])
    if not src: raise HTTPException(status_code=404, detail="Not found")
    new_id = str(uuid.uuid4())
    await execute(
        "insert into templates (id, workspace_id, name, description, sections, type, frequency, "
        "assignment_scope, group_id, target_ids, active, created_by, version, family_id) values (:id, :ws, :name, "
        ":description, :sections ::jsonb, :type, :frequency, :assignment_scope, :group_id, "
        ":target_ids ::jsonb, :active, :created_by, 1, :id)",
        id=new_id, ws=user["workspace_id"], name=f"{src['name']} copy", description=src.get("description"),
        sections=json_dumps(src.get("sections", [])), type=src.get("type", "vehicle"),
        frequency=src.get("frequency"), assignment_scope=src.get("assignment_scope", "all"),
        group_id=src.get("group_id"), target_ids=json_dumps(src.get("target_ids", [])),
        active=src.get("active", True), created_by=user["id"],
    )
    doc = await fetch_one("select * from templates where id = :id", id=new_id)
    await log_event(user, "template.duplicated", "template", new_id, {"name": doc["name"], "source_id": tid})
    return doc

@api.get("/templates/{tid}")
async def get_template(tid: str, user: dict = Depends(get_current_user)):
    t = await fetch_one("select * from templates where id = :id and workspace_id = :ws", id=tid, ws=user["workspace_id"])
    if not t: raise HTTPException(status_code=404, detail="Not found")
    return t

@api.patch("/templates/{tid}")
async def update_template(tid: str, patch: dict, user: dict = Depends(get_current_user)):
    ws = user["workspace_id"]
    current = await fetch_one("select * from templates where id = :id and workspace_id = :ws", id=tid, ws=ws)
    if not current: raise HTTPException(status_code=404, detail="Not found")

    if "sections" in patch:
        used = await fetch_one("select 1 as x from inspections where template_id = :id limit 1", id=tid)
        if used:
            # Editing the actual checklist content of a template that's already been filled in against —
            # version it instead of mutating history. Existing submissions keep their own
            # template_snapshot regardless, but the templates table should reflect the lineage too.
            new_id = str(uuid.uuid4())
            merged = {**current, **patch}
            await execute(
                "insert into templates (id, workspace_id, name, description, sections, type, frequency, "
                "assignment_scope, group_id, target_ids, active, created_by, version, family_id) values "
                "(:id, :ws, :name, :description, :sections ::jsonb, :type, :frequency, :assignment_scope, "
                ":group_id, :target_ids ::jsonb, :active, :created_by, :version, :family_id)",
                id=new_id, ws=ws, name=merged["name"], description=merged.get("description"),
                sections=json_dumps(merged["sections"]), type=merged["type"], frequency=merged.get("frequency"),
                assignment_scope=merged.get("assignment_scope", "all"), group_id=merged.get("group_id"),
                target_ids=json_dumps(merged.get("target_ids", [])), active=True, created_by=user["id"],
                version=current["version"] + 1, family_id=current["family_id"],
            )
            await execute("update templates set active = false where id = :id", id=tid)
            doc = await fetch_one("select * from templates where id = :id", id=new_id)
            await log_event(user, "template.versioned", "template", new_id, {"name": doc["name"], "version": doc["version"], "from": tid})
            return doc

    patch = {**patch, "updated_at": datetime.now(timezone.utc)}
    await update_row("templates", tid, ws, patch, TEMPLATE_COLS | {"updated_at"})
    return await fetch_one("select * from templates where id = :id and workspace_id = :ws", id=tid, ws=ws)

@api.delete("/templates/{tid}")
async def delete_template(tid: str, user: dict = Depends(get_current_user)):
    doc = await fetch_one("select name from templates where id = :id and workspace_id = :ws", id=tid, ws=user["workspace_id"])
    await execute("delete from templates where id = :id and workspace_id = :ws", id=tid, ws=user["workspace_id"])
    if doc:
        await log_event(user, "template.deleted", "template", tid, {"name": doc["name"]})
    return {"ok": True}

# --- Inspections ---
@api.get("/inspections")
async def list_inspections(vehicle_id: Optional[str] = None, asset_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    ws = user["workspace_id"]
    if vehicle_id:
        rows = await fetch_all(
            "select * from inspections where workspace_id = :ws and vehicle_id = :vid order by created_at desc",
            ws=ws, vid=vehicle_id,
        )
    elif asset_id:
        rows = await fetch_all(
            "select * from inspections where workspace_id = :ws and asset_id = :aid order by created_at desc",
            ws=ws, aid=asset_id,
        )
    else:
        rows = await fetch_all("select * from inspections where workspace_id = :ws order by created_at desc", ws=ws)

    vids = list({r["vehicle_id"] for r in rows if r.get("vehicle_id")})
    aids = list({r["asset_id"] for r in rows if r.get("asset_id")})
    tids = list({r["template_id"] for r in rows if r.get("template_id")})
    vmap = {v["id"]: v for v in (await fetch_all("select * from vehicles where workspace_id = :ws and id = any(:ids)", ws=ws, ids=vids) if vids else [])}
    amap = {a["id"]: a for a in (await fetch_all("select * from assets where workspace_id = :ws and id = any(:ids)", ws=ws, ids=aids) if aids else [])}
    tmap = {t["id"]: t for t in (await fetch_all("select id, name from templates where workspace_id = :ws and id = any(:ids)", ws=ws, ids=tids) if tids else [])}
    for r in rows:
        v = vmap.get(r.get("vehicle_id"))
        a = amap.get(r.get("asset_id"))
        target = v or a
        r["target_name"] = target.get("name") if target else None
        r["target_plate"] = v.get("plate") if v else (a.get("identifier") if a else None)
        r["target_kind"] = "vehicle" if v else (a.get("kind") if a else None)
        r["template_name"] = (tmap.get(r.get("template_id")) or {}).get("name")
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    return _scope_filter(rows, allowed_vehicles, allowed_assets)

async def _reverse_geocode(lat: float, lon: float) -> Optional[str]:
    """Best-effort resolved address for a mobile-captured GPS fix — never blocks the submission."""
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "jsonv2"},
                headers={"User-Agent": "FleetIntel/1.0"},
            )
            if r.status_code == 200:
                return r.json().get("display_name")
    except Exception as e:
        logger.warning(f"reverse geocode failed: {e}")
    return None

@api.post("/inspections")
async def create_inspection(i: InspectionIn, user: dict = Depends(get_current_user)):
    if bool(i.vehicle_id) == bool(i.asset_id):
        raise HTTPException(status_code=400, detail="Provide exactly one of vehicle_id or asset_id")
    ws = user["workspace_id"]

    if i.client_submission_id:
        existing = await fetch_one(
            "select * from inspections where workspace_id = :ws and client_submission_id = :cid",
            ws=ws, cid=i.client_submission_id,
        )
        if existing:
            return existing  # idempotent retry — a dropped-connection resync must not duplicate the record

    if i.vehicle_id and not (i.odometer and i.odometer > 0):
        raise HTTPException(status_code=400, detail="Odometer reading is required for a vehicle checklist")
    if not i.signature:
        raise HTTPException(status_code=400, detail="Signature is required")
    for a in i.answers:
        if str(a.value).lower() == "fail":
            missing = [f for f, ok in (("note", bool(a.note and a.note.strip())), ("photo", bool(a.photo)), ("defect_type", bool(a.defect_type))) if not ok]
            if missing:
                raise HTTPException(status_code=400, detail=f"Item {a.item_id} is marked as a defect but is missing: {', '.join(missing)}")
            if a.defect_type not in DEFECT_TYPES:
                raise HTTPException(status_code=400, detail=f"Item {a.item_id} has an invalid defect_type: {a.defect_type}")

    template = await fetch_one("select * from templates where id = :id and workspace_id = :ws", id=i.template_id, ws=ws)
    iid = str(uuid.uuid4())
    answers = [a.model_dump() for a in i.answers]
    fails = sum(1 for a in answers if str(a.get("value", "")).lower() == "fail")
    if i.odometer and i.vehicle_id:
        await execute(
            "update vehicles set odometer = :odo where id = :vid and workspace_id = :ws",
            odo=i.odometer, vid=i.vehicle_id, ws=ws,
        )
    address = i.address
    if not address and i.latitude is not None and i.longitude is not None:
        address = await _reverse_geocode(i.latitude, i.longitude)
    snapshot = {"name": template["name"], "sections": template["sections"]} if template else None
    location_status = i.location_status or "not_attempted"
    if location_status == "not_attempted" and i.latitude is not None:
        location_status = "captured"
    completed_at_val = _parse_datetime(i.completed_at) if i.completed_at else datetime.now(timezone.utc)
    started_at_val = _parse_datetime(i.started_at) if i.started_at else completed_at_val
    await execute(
        "insert into inspections (id, workspace_id, template_id, vehicle_id, asset_id, answers, notes, "
        "odometer, inspector_id, inspector_name, fail_count, status, completed_at, started_at, latitude, longitude, "
        "address, location_status, signature, client_submission_id, template_snapshot) values (:id, :ws, :template_id, "
        ":vehicle_id, :asset_id, :answers ::jsonb, :notes, :odometer, :inspector_id, :inspector_name, "
        ":fail_count, 'completed', :completed_at, :started_at, :latitude, :longitude, :address, :location_status, :signature, "
        ":client_submission_id, :template_snapshot ::jsonb)",
        id=iid, ws=ws, template_id=i.template_id, vehicle_id=i.vehicle_id,
        asset_id=i.asset_id, answers=json_dumps(answers), notes=i.notes, odometer=i.odometer,
        inspector_id=user["id"], inspector_name=user["name"], fail_count=fails,
        completed_at=completed_at_val, started_at=started_at_val,
        latitude=i.latitude, longitude=i.longitude, address=address, location_status=location_status, signature=i.signature,
        client_submission_id=i.client_submission_id, template_snapshot=json_dumps(snapshot) if snapshot else None,
    )
    return await fetch_one("select * from inspections where id = :id", id=iid)

@api.get("/inspections/{iid}")
async def get_inspection(iid: str, user: dict = Depends(get_current_user)):
    x = await fetch_one("select * from inspections where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])
    if not x: raise HTTPException(status_code=404, detail="Not found")
    return x

MAINTENANCE_COLS = {"status", "actual_cost", "parts_cost", "labor_cost", "downtime_hours",
                     "assigned_to", "notes", "completed_at", "started_at", "category",
                     "odometer", "engine_hours", "workshop_name", "technician", "vendor",
                     "external_cost", "completion_documents", "client_submission_id", "previous_status"}

# --- Maintenance jobs ---
@api.get("/maintenance")
async def list_maintenance(user: dict = Depends(get_current_user)):
    ws = user["workspace_id"]
    if user.get("role") == "mechanic":
        # assigned_to is a text column, but user["id"] decodes from Postgres as a uuid.UUID object
        # (asyncpg's built-in codec for the user_profiles.id uuid column) -- str() it explicitly,
        # or asyncpg rejects the param with "expected str, got UUID".
        rows = await fetch_all(
            "select * from maintenance where workspace_id = :ws and assigned_to = :uid order by created_at desc",
            ws=ws, uid=str(user["id"]),
        )
    else:
        rows = await fetch_all("select * from maintenance where workspace_id = :ws order by created_at desc", ws=ws)
    aids = list({r["asset_id"] for r in rows if r.get("asset_id")})
    amap = {a["id"]: a for a in (await fetch_all("select id, name, identifier from assets where workspace_id = :ws and id = any(:ids)", ws=ws, ids=aids) if aids else [])}
    for r in rows:
        if r.get("asset_id") and r["asset_id"] in amap:
            r["asset_name"] = amap[r["asset_id"]]["name"]
            r["asset_identifier"] = amap[r["asset_id"]]["identifier"]
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    return _scope_filter(rows, allowed_vehicles, allowed_assets)

@api.post("/maintenance")
async def create_maintenance(m: MaintenanceIn, user: dict = Depends(require_module("maintenance", "full"))):
    if bool(m.vehicle_id) == bool(m.asset_id):
        raise HTTPException(status_code=400, detail="Provide exactly one of vehicle_id or asset_id")
    if m.vehicle_id and not (m.odometer and m.odometer > 0):
        raise HTTPException(status_code=400, detail="Vehicle odometer reading is required to create a job")
    mid = str(uuid.uuid4())
    due_at_creation = None
    if m.schedule_id:
        try:
            due_row = await fetch_one(
                "select next_due_date, base_date, base_odometer, base_hours from schedule_due_state "
                "where schedule_id = :sid and vehicle_id is not distinct from :vid and asset_id is not distinct from :aid",
                sid=m.schedule_id, vid=m.vehicle_id, aid=m.asset_id,
            )
            if due_row:
                intervals = [Interval(r["trigger_type"], float(r["every_n"]), r["unit"])
                             for r in await fetch_all("select * from schedule_intervals where schedule_id = :sid", sid=m.schedule_id)]
                if m.vehicle_id:
                    v = await fetch_one("select odometer, engine_hours from vehicles where id = :id", id=m.vehicle_id)
                    ref_odo, ref_hrs = (v or {}).get("odometer"), (v or {}).get("engine_hours")
                else:
                    a = await fetch_one("select engine_hours from assets where id = :id", id=m.asset_id)
                    ref_odo, ref_hrs = None, (a or {}).get("engine_hours")
                due = compute_due_state(intervals, base_date=due_row["base_date"], base_odometer=due_row["base_odometer"],
                                         base_hours=due_row["base_hours"], ref_date=datetime.now(timezone.utc).date(),
                                         ref_odometer=ref_odo, ref_hours=ref_hrs)
                due_at_creation = due.next_due_date
        except ValueError:
            # A distance/engine-hours trigger with no baseline reading yet (e.g. engine_hours never
            # recorded) can't be evaluated — the Compliance report just won't have a due-date snapshot
            # for this job, which is a missing data point, not a reason to block job creation.
            due_at_creation = None
    await execute(
        "insert into maintenance (id, workspace_id, vehicle_id, asset_id, inspection_id, driver_id, schedule_id, title, "
        "description, priority, category, estimated_cost, estimated_hours, assigned_to, parts_cost, labor_cost, "
        "odometer, engine_hours, status, created_by, actual_cost, downtime_hours, due_at_creation) values (:id, :ws, :vehicle_id, :asset_id, "
        ":inspection_id, :driver_id, :schedule_id, :title, :description, :priority, :category, :estimated_cost, :estimated_hours, "
        ":assigned_to, :parts_cost, :labor_cost, :odometer, :engine_hours, 'pending', :created_by, 0, 0, :due_at_creation)",
        id=mid, ws=user["workspace_id"], created_by=user["id"], due_at_creation=due_at_creation, **m.model_dump(),
    )
    if m.vehicle_id:
        # greatest(): never let a job's odometer reading regress the vehicle's stored value — e.g.
        # someone logging a job retroactively for older work shouldn't overwrite a more recent reading.
        await execute(
            "update vehicles set status = 'maintenance', odometer = greatest(coalesce(odometer, 0), :odo) "
            "where id = :vid and workspace_id = :ws",
            odo=m.odometer, vid=m.vehicle_id, ws=user["workspace_id"],
        )
    else:
        await execute(
            "update assets set status = 'maintenance' where id = :aid and workspace_id = :ws",
            aid=m.asset_id, ws=user["workspace_id"],
        )
    doc = await fetch_one("select * from maintenance where id = :id", id=mid)
    await log_event(user, "maintenance.created", "maintenance", mid, {"title": doc["title"], "priority": doc["priority"]})
    return doc

@api.get("/maintenance/{mid}")
async def get_maintenance(mid: str, user: dict = Depends(get_current_user)):
    m = await fetch_one("select * from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
    if not m: raise HTTPException(status_code=404, detail="Not found")
    # str() on the right-hand side: assigned_to comes back as text, user["id"] as a uuid.UUID object
    # -- those never compare equal in Python even for the "same" id, which made this check reject
    # every mechanic viewing their own assigned job.
    if user.get("role") == "mechanic" and m.get("assigned_to") != str(user["id"]):
        raise HTTPException(status_code=404, detail="Not found")
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    if not _scope_filter([m], allowed_vehicles, allowed_assets):
        raise HTTPException(status_code=404, detail="Not found")
    v = await fetch_one("select name, plate from vehicles where id = :id", id=m["vehicle_id"]) if m.get("vehicle_id") else None
    ast = await fetch_one("select name, identifier from assets where id = :id", id=m["asset_id"]) if m.get("asset_id") else None
    d = await fetch_one("select name from drivers where id = :id", id=m["driver_id"]) if m.get("driver_id") else None
    a = await fetch_one("select name from user_profiles where id = :id", id=m["assigned_to"]) if m.get("assigned_to") else None
    m["vehicle_name"] = v.get("name") if v else (ast.get("name") if ast else None)
    m["vehicle_plate"] = v.get("plate") if v else (ast.get("identifier") if ast else None)
    m["driver_name"] = d.get("name") if d else None
    m["assigned_to_name"] = a.get("name") if a else None
    return m

@api.patch("/maintenance/{mid}")
async def update_maintenance(mid: str, patch: MaintenanceUpdate, user: dict = Depends(require_module("maintenance", "full"))):
    upd = {k: v for k, v in patch.model_dump().items() if v is not None}
    job = await fetch_one("select * from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
    if not job: raise HTTPException(status_code=404, detail="Not found")
    if patch.client_submission_id and job.get("client_submission_id") == patch.client_submission_id:
        # Already applied by an earlier attempt of this same offline-queued update — a retried mobile
        # sync must not re-stamp completed_at/downtime_hours against a new "now", or re-fire the
        # defect-auto-resolve cascade a second time.
        return job
    if upd.get("status") == "on_hold":
        # Store what it was doing before the hold so /resume can put it back without the client
        # having to remember (and risk overwriting with a stale value) itself.
        upd["previous_status"] = job.get("status")
    if upd.get("status") == "completed":
        pending_req = await fetch_one(
            "select id from parts_requisitions where maintenance_id = :mid and workspace_id = :ws and status = 'pending_approval'",
            mid=mid, ws=user["workspace_id"],
        )
        if pending_req:
            raise HTTPException(status_code=400, detail="Cannot complete this job while a parts request is awaiting approval")
        completed_at = datetime.now(timezone.utc)
        upd["completed_at"] = completed_at
        # float() each term -- a numeric column decodes from Postgres as decimal.Decimal, but a
        # client-supplied JSON number in `upd` is a float; mixing the two in arithmetic raises
        # TypeError whenever only some of the three cost fields are provided in this PATCH.
        pc = float(upd.get("parts_cost", job.get("parts_cost", 0)) or 0)
        lc = float(upd.get("labor_cost", job.get("labor_cost", 0)) or 0)
        ec = float(upd.get("external_cost", job.get("external_cost", 0)) or 0)
        upd["actual_cost"] = upd.get("actual_cost") or (pc + lc + ec)
        # Downtime is real elapsed time, not a trust-the-user number: the vehicle was down from
        # whenever work actually started (started_at) — or, if a job skipped "in_progress" and went
        # straight to completed, from whenever the job was first opened (created_at) — until now.
        started = job.get("started_at") or job.get("created_at")
        if started:
            upd["downtime_hours"] = round((completed_at - started).total_seconds() / 3600, 1)
        completion_odo = upd.get("odometer", job.get("odometer"))
        completion_hrs = upd.get("engine_hours", job.get("engine_hours"))
        if job.get("vehicle_id"):
            await execute(
                "update vehicles set status = 'active', odometer = greatest(coalesce(odometer, 0), :odo), "
                "engine_hours = greatest(coalesce(engine_hours, 0), :hrs) where id = :vid and workspace_id = :ws",
                odo=completion_odo or 0, hrs=completion_hrs or 0, vid=job["vehicle_id"], ws=user["workspace_id"],
            )
        else:
            await execute(
                "update assets set status = 'active', engine_hours = greatest(coalesce(engine_hours, 0), :hrs) "
                "where id = :aid and workspace_id = :ws",
                hrs=completion_hrs or 0, aid=job["asset_id"], ws=user["workspace_id"],
            )
        if job.get("schedule_id"):
            await _reset_schedule_due_state(
                user["workspace_id"], job["schedule_id"], job.get("vehicle_id"), job.get("asset_id"),
                completed_at.date(), completion_odo, completion_hrs,
            )
        # Feature 7 cascade: completing the job auto-resolves any defect(s) that were converted into
        # it — Defect + Work Order + Maintenance Event close together as one action, not three.
        linked_defects = await fetch_all("select id from defects where maintenance_id = :mid and workspace_id = :ws", mid=mid, ws=user["workspace_id"])
        for ld in linked_defects:
            await update_row("defects", ld["id"], user["workspace_id"],
                              {"status": "resolved", "resolved_at": completed_at, "resolution_notes": f"Resolved via maintenance job: {job.get('title', '')}"},
                              DEFECT_COLS)
    if upd.get("status") == "in_progress":
        upd["started_at"] = datetime.now(timezone.utc)
    await update_row("maintenance", mid, user["workspace_id"], upd, MAINTENANCE_COLS)
    if upd.get("status"):
        await log_event(user, f"maintenance.{upd['status']}", "maintenance", mid, {"title": job.get("title", ""), "actual_cost": upd.get("actual_cost")})
    return await fetch_one("select * from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])

@api.post("/maintenance/{mid}/photos")
async def add_maintenance_photo(mid: str, p: MaintenancePhotoIn, user: dict = Depends(require_module("maintenance", "full"))):
    """Attaches a photo/document to a job at any point in its lifecycle -- not just at completion,
    unlike completion_documents which is only ever set wholesale by the Complete step. Appends to
    the same column so both the mid-job and completion-time photos show up in one place."""
    job = await fetch_one("select completion_documents from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
    if not job: raise HTTPException(status_code=404, detail="Not found")
    docs = job.get("completion_documents") or []
    if p.client_submission_id and any(d.get("client_submission_id") == p.client_submission_id for d in docs):
        return {"completion_documents": docs}
    docs.append({
        "name": p.name, "data": p.data, "added_by": user["id"], "added_at": now_iso(),
        "client_submission_id": p.client_submission_id,
    })
    await update_row("maintenance", mid, user["workspace_id"], {"completion_documents": docs}, MAINTENANCE_COLS)
    await log_event(user, "maintenance.photo_added", "maintenance", mid, {"name": p.name})
    return {"completion_documents": docs}

@api.post("/maintenance/{mid}/resume")
async def resume_maintenance(mid: str, user: dict = Depends(require_module("maintenance", "full"))):
    """Restores a job from on_hold to whatever it was doing before -- a dedicated endpoint rather than
    letting the generic PATCH accept an arbitrary client-supplied status here, so a stale/racing client
    can't overwrite previous_status with the wrong value."""
    job = await fetch_one("select * from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
    if not job: raise HTTPException(status_code=404, detail="Not found")
    if job.get("status") != "on_hold":
        raise HTTPException(status_code=400, detail="This job isn't on hold")
    restored = job.get("previous_status") or "in_progress"
    await update_row("maintenance", mid, user["workspace_id"], {"status": restored, "previous_status": None}, MAINTENANCE_COLS)
    await log_event(user, "maintenance.resumed", "maintenance", mid, {"restored_status": restored})
    return await fetch_one("select * from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])

@api.delete("/maintenance/{mid}")
async def delete_maintenance(mid: str, user: dict = Depends(require_module("maintenance", "full"))):
    await execute("delete from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
    return {"ok": True}

# --- Maintenance Scheduling & Service Reminder module ---
# Roles: Fleet Manager (manager, operations_manager) create/edit/close schedules — require_module
# "maintenance" full, same as the existing one-off maintenance jobs. Workshop Manager (workshop_head,
# mechanic) completes maintenance — already gated the same way on PATCH /maintenance. Executive
# (finance, finance_staff) gets read-only via require_module(..., "read"). Driver has no dedicated
# RBAC role in this system — "view upcoming maintenance only" maps to the existing read-level grant
# every authenticated role already has on this module via PROFILE_PRESETS.

DEFAULT_ASSET_TYPES = [
    ("Cars", "Vehicles"), ("Vans", "Vehicles"), ("Bakkies", "Vehicles"), ("SUVs", "Vehicles"),
    ("Rigid Trucks", "Trucks"), ("Tautliners", "Trucks"), ("Tankers", "Trucks"), ("Refrigerated Trucks", "Trucks"),
    ("Flatbeds", "Trailers"), ("Side Tippers", "Trailers"), ("Lowbeds", "Trailers"), ("Skeletals", "Trailers"),
    ("Excavators", "Equipment"), ("Loaders", "Equipment"), ("Dumpers", "Equipment"), ("Forklifts", "Equipment"), ("Cranes", "Equipment"),
    ("Generators", "Other Assets"), ("Compressors", "Other Assets"), ("Pumps", "Other Assets"), ("Fixed Plant", "Other Assets"),
]
DEFAULT_MAINTENANCE_TYPES = [
    ("Minor Service", "Services"), ("Major Service", "Services"), ("OEM Service", "Services"), ("Annual Service", "Services"),
    ("Tyre Rotation", "Tyres"), ("Tyre Replacement", "Tyres"), ("Wheel Alignment", "Tyres"), ("Wheel Balancing", "Tyres"),
    ("Oil Change", "Engine"), ("Filter Change", "Engine"), ("Coolant Change", "Engine"), ("Belt Replacement", "Engine"),
    ("Brake Inspection", "Safety"), ("Brake Pad Replacement", "Safety"), ("Fire Extinguisher Inspection", "Safety"),
    ("Roadworthy Inspection", "Compliance"), ("License Renewal", "Compliance"), ("COF Renewal", "Compliance"), ("Safety Certification", "Compliance"),
    # Referenced by DEFAULT_MAINTENANCE_TEMPLATES' Truck/Trailer/Equipment templates below but not
    # covered by the preset categories above — seeded as "Custom" per Feature 2's "unlimited
    # user-defined maintenance categories", same as anything a user types in themselves.
    ("Differential Service", "Custom"), ("Suspension Inspection", "Custom"), ("Wheel Bearing Inspection", "Custom"),
    ("Structural Inspection", "Custom"), ("Hydraulic Service", "Custom"), ("Engine Service", "Custom"), ("Safety Inspection", "Custom"),
]

# Feature 8 — default templates. Interval numbers aren't specified in the PRD (only item names are),
# so these are reasonable fleet-industry defaults; every one is editable/deletable after seeding.
DEFAULT_MAINTENANCE_TEMPLATES = {
    "Light Vehicle Template": [
        ("Minor Service", "time", 3, "months"), ("Major Service", "time", 12, "months"),
        ("Tyre Rotation", "distance", 10000, "km"), ("Brake Inspection", "time", 6, "months"),
    ],
    "Truck Template": [
        ("Minor Service", "time", 2, "months"), ("Major Service", "time", 6, "months"),
        ("Wheel Alignment", "distance", 20000, "km"), ("Brake Inspection", "time", 3, "months"),
        ("Differential Service", "distance", 40000, "km"),
    ],
    "Trailer Template": [
        ("Suspension Inspection", "time", 3, "months"), ("Wheel Bearing Inspection", "distance", 20000, "km"),
        ("Structural Inspection", "time", 12, "months"),
    ],
    "Yellow Equipment Template": [
        ("Hydraulic Service", "time", 6, "months"), ("Engine Service", "engine_hours", 500, "hours"),
        ("Safety Inspection", "time", 1, "months"),
    ],
}

async def _seed_default_taxonomies(ws: str):
    """Runs once per new workspace (called from register()) — seed data only, every row stays a
    normal editable/deletable asset_types|maintenance_types row afterwards (Features 1's "extensible,
    not a closed list" requirement)."""
    for name, category in DEFAULT_ASSET_TYPES:
        await execute(
            "insert into asset_types (id, workspace_id, name, category) values (:id, :ws, :name, :cat) "
            "on conflict (workspace_id, name) do nothing",
            id=str(uuid.uuid4()), ws=ws, name=name, cat=category,
        )
    for name, category in DEFAULT_MAINTENANCE_TYPES:
        await execute(
            "insert into maintenance_types (id, workspace_id, name, category) values (:id, :ws, :name, :cat) "
            "on conflict (workspace_id, name) do nothing",
            id=str(uuid.uuid4()), ws=ws, name=name, cat=category,
        )
    mtype_ids = {r["name"]: r["id"] for r in await fetch_all("select id, name from maintenance_types where workspace_id = :ws", ws=ws)}
    for tname, items in DEFAULT_MAINTENANCE_TEMPLATES.items():
        existing = await fetch_one("select id from maintenance_templates where workspace_id = :ws and name = :name", ws=ws, name=tname)
        if existing:
            continue
        tid = str(uuid.uuid4())
        await execute("insert into maintenance_templates (id, workspace_id, name) values (:id, :ws, :name)", id=tid, ws=ws, name=tname)
        for mtype_name, trigger_type, every_n, unit in items:
            await execute(
                "insert into maintenance_template_items (id, template_id, maintenance_type_id, trigger_type, every_n, unit) "
                "values (:id, :tid, :mtid, :tt, :n, :u)",
                id=str(uuid.uuid4()), tid=tid, mtid=mtype_ids[mtype_name], tt=trigger_type, n=every_n, u=unit,
            )

class AssetTypeIn(BaseModel):
    name: str
    category: str

class MaintenanceTypeIn(BaseModel):
    name: str
    category: str

@api.get("/asset-types")
async def list_asset_types(user: dict = Depends(require_module("maintenance", "read"))):
    return await fetch_all(
        "select * from asset_types where workspace_id = :ws and active = true order by category, name",
        ws=user["workspace_id"],
    )

@api.post("/asset-types")
async def create_asset_type(t: AssetTypeIn, user: dict = Depends(require_module("maintenance", "full"))):
    tid = str(uuid.uuid4())
    await execute(
        "insert into asset_types (id, workspace_id, name, category) values (:id, :ws, :name, :cat)",
        id=tid, ws=user["workspace_id"], name=t.name, cat=t.category,
    )
    return await fetch_one("select * from asset_types where id = :id", id=tid)

@api.get("/maintenance-types")
async def list_maintenance_types(user: dict = Depends(require_module("maintenance", "read"))):
    return await fetch_all(
        "select * from maintenance_types where workspace_id = :ws and active = true order by category, name",
        ws=user["workspace_id"],
    )

@api.post("/maintenance-types")
async def create_maintenance_type(t: MaintenanceTypeIn, user: dict = Depends(require_module("maintenance", "full"))):
    tid = str(uuid.uuid4())
    await execute(
        "insert into maintenance_types (id, workspace_id, name, category) values (:id, :ws, :name, :cat)",
        id=tid, ws=user["workspace_id"], name=t.name, cat=t.category,
    )
    return await fetch_one("select * from maintenance_types where id = :id", id=tid)


class ScheduleIntervalIn(BaseModel):
    trigger_type: Literal["time", "distance", "engine_hours"]
    every_n: float
    unit: str

class ScheduleReminderIn(BaseModel):
    trigger_type: Literal["time", "distance", "engine_hours"]
    threshold_n: float

class MaintenanceScheduleIn(BaseModel):
    name: str
    maintenance_type_id: str
    asset_type_id: Optional[str] = None
    description: Optional[str] = ""
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    vehicle_ids: List[str] = []
    asset_ids: List[str] = []
    intervals: List[ScheduleIntervalIn] = []
    reminders: List[ScheduleReminderIn] = []

class MaintenanceScheduleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None
    status: Optional[Literal["active", "paused"]] = None
    vehicle_ids: Optional[List[str]] = None
    asset_ids: Optional[List[str]] = None
    intervals: Optional[List[ScheduleIntervalIn]] = None
    reminders: Optional[List[ScheduleReminderIn]] = None


async def _ensure_due_state_rows(ws: str, schedule_id: str):
    """Creates a schedule_due_state baseline row (base_date/base_odometer/base_hours = right now,
    i.e. the schedule's own creation point) for any assigned asset that doesn't have one yet. A row
    that already exists is left untouched — only completion resets a baseline (Feature 6)."""
    sched = await fetch_one("select created_at from maintenance_schedules where id = :id and workspace_id = :ws", id=schedule_id, ws=ws)
    if not sched:
        return
    today = datetime.now(timezone.utc).date()
    assigned = await fetch_all("select * from schedule_assets where schedule_id = :sid", sid=schedule_id)
    for sa in assigned:
        existing = await fetch_one(
            "select id from schedule_due_state where schedule_id = :sid "
            "and vehicle_id is not distinct from :vid and asset_id is not distinct from :aid",
            sid=schedule_id, vid=sa["vehicle_id"], aid=sa["asset_id"],
        )
        if existing:
            continue
        if sa["vehicle_id"]:
            v = await fetch_one("select odometer, engine_hours from vehicles where id = :id", id=sa["vehicle_id"])
            base_odo, base_hrs = (v or {}).get("odometer"), (v or {}).get("engine_hours")
        else:
            a = await fetch_one("select engine_hours from assets where id = :id", id=sa["asset_id"])
            base_odo, base_hrs = None, (a or {}).get("engine_hours")
        await execute(
            "insert into schedule_due_state (id, schedule_id, vehicle_id, asset_id, base_date, base_odometer, base_hours) "
            "values (:id, :sid, :vid, :aid, :bd, :bo, :bh)",
            id=str(uuid.uuid4()), sid=schedule_id, vid=sa["vehicle_id"], aid=sa["asset_id"],
            bd=today, bo=base_odo, bh=base_hrs,
        )

async def _reset_schedule_due_state(ws: str, schedule_id: str, vehicle_id: Optional[str], asset_id: Optional[str],
                                     completion_date, completion_odometer, completion_hours):
    """Feature 6: on completion, every trigger on the schedule re-bases off THIS completion event,
    independently per trigger — implemented by simply overwriting the stored baseline; each read
    (compute_due_state) re-derives next-due per trigger from that new baseline on its own."""
    await execute(
        "update schedule_due_state set base_date = :bd, base_odometer = :bo, base_hours = :bh, "
        "last_fired_thresholds = '[]'::jsonb, updated_at = now() "
        "where schedule_id = :sid and vehicle_id is not distinct from :vid and asset_id is not distinct from :aid",
        bd=completion_date, bo=completion_odometer, bh=completion_hours,
        sid=schedule_id, vid=vehicle_id, aid=asset_id,
    )

async def _replace_schedule_children(schedule_id: str, ws: str, vehicle_ids: List[str], asset_ids: List[str],
                                      intervals: List[ScheduleIntervalIn], reminders: List[ScheduleReminderIn]):
    await execute("delete from schedule_assets where schedule_id = :sid", sid=schedule_id)
    await execute("delete from schedule_intervals where schedule_id = :sid", sid=schedule_id)
    await execute("delete from schedule_reminders where schedule_id = :sid", sid=schedule_id)
    for vid in vehicle_ids:
        await execute("insert into schedule_assets (id, schedule_id, vehicle_id) values (:id, :sid, :vid)",
                      id=str(uuid.uuid4()), sid=schedule_id, vid=vid)
    for aid in asset_ids:
        await execute("insert into schedule_assets (id, schedule_id, asset_id) values (:id, :sid, :aid)",
                      id=str(uuid.uuid4()), sid=schedule_id, aid=aid)
    for iv in intervals:
        await execute(
            "insert into schedule_intervals (id, schedule_id, trigger_type, every_n, unit) values (:id, :sid, :tt, :n, :u)",
            id=str(uuid.uuid4()), sid=schedule_id, tt=iv.trigger_type, n=iv.every_n, u=iv.unit,
        )
    for r in reminders:
        await execute(
            "insert into schedule_reminders (id, schedule_id, trigger_type, threshold_n) values (:id, :sid, :tt, :n)",
            id=str(uuid.uuid4()), sid=schedule_id, tt=r.trigger_type, n=r.threshold_n,
        )

async def _schedule_detail(ws: str, schedule_id: str) -> Optional[dict]:
    sched = await fetch_one("select * from maintenance_schedules where id = :id and workspace_id = :ws", id=schedule_id, ws=ws)
    if not sched:
        return None
    interval_rows = await fetch_all("select * from schedule_intervals where schedule_id = :sid", sid=schedule_id)
    reminder_rows = await fetch_all("select * from schedule_reminders where schedule_id = :sid", sid=schedule_id)
    assigned = await fetch_all("select * from schedule_assets where schedule_id = :sid", sid=schedule_id)
    due_rows = {
        (r["vehicle_id"], r["asset_id"]): r
        for r in await fetch_all("select * from schedule_due_state where schedule_id = :sid", sid=schedule_id)
    }
    intervals = [Interval(r["trigger_type"], float(r["every_n"]), r["unit"]) for r in interval_rows]
    reminders = [(r["trigger_type"], float(r["threshold_n"])) for r in reminder_rows]
    ref_date = datetime.now(timezone.utc).date()

    assets_out = []
    for sa in assigned:
        due_row = due_rows.get((sa["vehicle_id"], sa["asset_id"]))
        if sa["vehicle_id"]:
            target = await fetch_one("select id, name, plate, odometer, engine_hours from vehicles where id = :id", id=sa["vehicle_id"])
            kind, target_id, target_name, target_ref = "vehicle", sa["vehicle_id"], target["name"] if target else None, target
        else:
            target = await fetch_one("select id, name, identifier, engine_hours from assets where id = :id", id=sa["asset_id"])
            kind, target_id, target_name, target_ref = "asset", sa["asset_id"], target["name"] if target else None, target
        entry = {"kind": kind, "id": target_id, "name": target_name, "status": "awaiting_telematics", "remaining_days": None,
                 "next_due_date": None, "next_due_distance": None, "next_due_hours": None}
        if due_row and intervals and target_ref:
            ref_odo = target_ref.get("odometer") if kind == "vehicle" else None
            ref_hrs = target_ref.get("engine_hours")
            due = compute_due_state(intervals, base_date=due_row["base_date"], base_odometer=due_row["base_odometer"],
                                     base_hours=due_row["base_hours"], ref_date=ref_date, ref_odometer=ref_odo, ref_hours=ref_hrs)
            status = classify_status(due, reminders)
            entry.update({
                "status": status.status, "remaining_days": status.remaining_days,
                "next_due_date": due.next_due_date.isoformat() if due.next_due_date else None,
                "next_due_distance": due.next_due_distance, "next_due_hours": due.next_due_hours,
                "effective_trigger_type": due.effective_trigger_type,
            })
        assets_out.append(entry)

    sched["intervals"] = interval_rows
    sched["reminders"] = reminder_rows
    sched["assets"] = assets_out
    # Schedule-level status: worst (most urgent) across its assigned assets — overdue > due_soon >
    # on_track > awaiting_telematics, so a dashboard tile summing schedules can just read this field.
    order = {"overdue": 3, "due_soon": 2, "on_track": 1, "awaiting_telematics": 0}
    sched["status_summary"] = max((a["status"] for a in assets_out), key=lambda s: order[s], default="awaiting_telematics")
    return sched

@api.get("/maintenance-schedules")
async def list_maintenance_schedules(user: dict = Depends(require_module("maintenance", "read"))):
    rows = await fetch_all(
        "select id from maintenance_schedules where workspace_id = :ws order by created_at desc", ws=user["workspace_id"],
    )
    return [await _schedule_detail(user["workspace_id"], r["id"]) for r in rows]

@api.post("/maintenance-schedules")
async def create_maintenance_schedule(s: MaintenanceScheduleIn, user: dict = Depends(require_module("maintenance", "full"))):
    if not s.vehicle_ids and not s.asset_ids:
        raise HTTPException(status_code=400, detail="Select at least one asset for this schedule")
    if not s.intervals:
        raise HTTPException(status_code=400, detail="Configure at least one interval trigger")
    sid = str(uuid.uuid4())
    await execute(
        "insert into maintenance_schedules (id, workspace_id, name, maintenance_type_id, asset_type_id, "
        "description, priority, created_by) values (:id, :ws, :name, :mtid, :atid, :description, :priority, :uid)",
        id=sid, ws=user["workspace_id"], name=s.name, mtid=s.maintenance_type_id, atid=s.asset_type_id,
        description=s.description, priority=s.priority, uid=user["id"],
    )
    await _replace_schedule_children(sid, user["workspace_id"], s.vehicle_ids, s.asset_ids, s.intervals, s.reminders)
    await _ensure_due_state_rows(user["workspace_id"], sid)
    await log_event(user, "maintenance_schedule.created", "maintenance_schedule", sid, {"name": s.name})
    return await _schedule_detail(user["workspace_id"], sid)

@api.get("/maintenance-schedules/{sid}")
async def get_maintenance_schedule(sid: str, user: dict = Depends(require_module("maintenance", "read"))):
    detail = await _schedule_detail(user["workspace_id"], sid)
    if not detail:
        raise HTTPException(status_code=404, detail="Not found")
    return detail

@api.patch("/maintenance-schedules/{sid}")
async def update_maintenance_schedule(sid: str, s: MaintenanceScheduleUpdate, user: dict = Depends(require_module("maintenance", "full"))):
    existing = await fetch_one("select * from maintenance_schedules where id = :id and workspace_id = :ws", id=sid, ws=user["workspace_id"])
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    patch = {k: v for k, v in s.model_dump(exclude={"vehicle_ids", "asset_ids", "intervals", "reminders"}).items() if v is not None}
    await update_row("maintenance_schedules", sid, user["workspace_id"], patch, {"name", "description", "priority", "status"})
    if s.vehicle_ids is not None or s.asset_ids is not None or s.intervals is not None or s.reminders is not None:
        await _replace_schedule_children(
            sid, user["workspace_id"],
            s.vehicle_ids if s.vehicle_ids is not None else [r["vehicle_id"] for r in await fetch_all("select vehicle_id from schedule_assets where schedule_id = :sid and vehicle_id is not null", sid=sid)],
            s.asset_ids if s.asset_ids is not None else [r["asset_id"] for r in await fetch_all("select asset_id from schedule_assets where schedule_id = :sid and asset_id is not null", sid=sid)],
            s.intervals if s.intervals is not None else [Interval(r["trigger_type"], r["every_n"], r["unit"]) for r in await fetch_all("select * from schedule_intervals where schedule_id = :sid", sid=sid)],
            s.reminders if s.reminders is not None else [ScheduleReminderIn(trigger_type=r["trigger_type"], threshold_n=r["threshold_n"]) for r in await fetch_all("select * from schedule_reminders where schedule_id = :sid", sid=sid)],
        )
        await _ensure_due_state_rows(user["workspace_id"], sid)
    return await _schedule_detail(user["workspace_id"], sid)

@api.delete("/maintenance-schedules/{sid}")
async def delete_maintenance_schedule(sid: str, user: dict = Depends(require_module("maintenance", "full"))):
    await execute("delete from maintenance_schedules where id = :id and workspace_id = :ws", id=sid, ws=user["workspace_id"])
    return {"ok": True}


class TemplateItemIn(BaseModel):
    maintenance_type_id: str
    trigger_type: Literal["time", "distance", "engine_hours"]
    every_n: float
    unit: str

class MaintenanceTemplateIn(BaseModel):
    name: str
    asset_type_id: Optional[str] = None
    items: List[TemplateItemIn] = []

class ApplyTemplateIn(BaseModel):
    vehicle_ids: List[str] = []
    asset_ids: List[str] = []

async def _template_detail(ws: str, tid: str) -> Optional[dict]:
    t = await fetch_one("select * from maintenance_templates where id = :id and workspace_id = :ws", id=tid, ws=ws)
    if not t:
        return None
    t["items"] = await fetch_all(
        "select ti.*, mt.name as maintenance_type_name from maintenance_template_items ti "
        "join maintenance_types mt on mt.id = ti.maintenance_type_id where ti.template_id = :tid",
        tid=tid,
    )
    return t

@api.get("/maintenance-templates")
async def list_maintenance_templates(user: dict = Depends(require_module("maintenance", "read"))):
    rows = await fetch_all("select id from maintenance_templates where workspace_id = :ws order by name", ws=user["workspace_id"])
    return [await _template_detail(user["workspace_id"], r["id"]) for r in rows]

@api.post("/maintenance-templates")
async def create_maintenance_template(t: MaintenanceTemplateIn, user: dict = Depends(require_module("maintenance", "full"))):
    tid = str(uuid.uuid4())
    await execute(
        "insert into maintenance_templates (id, workspace_id, name, asset_type_id) values (:id, :ws, :name, :atid)",
        id=tid, ws=user["workspace_id"], name=t.name, atid=t.asset_type_id,
    )
    for i in t.items:
        await execute(
            "insert into maintenance_template_items (id, template_id, maintenance_type_id, trigger_type, every_n, unit) "
            "values (:id, :tid, :mtid, :tt, :n, :u)",
            id=str(uuid.uuid4()), tid=tid, mtid=i.maintenance_type_id, tt=i.trigger_type, n=i.every_n, u=i.unit,
        )
    return await _template_detail(user["workspace_id"], tid)

@api.delete("/maintenance-templates/{tid}")
async def delete_maintenance_template(tid: str, user: dict = Depends(require_module("maintenance", "full"))):
    await execute("delete from maintenance_templates where id = :id and workspace_id = :ws", id=tid, ws=user["workspace_id"])
    return {"ok": True}

@api.post("/maintenance-templates/{tid}/apply")
async def apply_maintenance_template(tid: str, body: ApplyTemplateIn, user: dict = Depends(require_module("maintenance", "full"))):
    """Feature 8: bulk-creates one schedule per template item, all assigned to the given assets —
    the user then edits individual schedules afterwards exactly like any other, per the spec."""
    if not body.vehicle_ids and not body.asset_ids:
        raise HTTPException(status_code=400, detail="Select at least one asset to apply the template to")
    template = await _template_detail(user["workspace_id"], tid)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template["items"]:
        raise HTTPException(status_code=400, detail="This template has no items configured")
    created_ids = []
    for item in template["items"]:
        sid = str(uuid.uuid4())
        await execute(
            "insert into maintenance_schedules (id, workspace_id, name, maintenance_type_id, asset_type_id, "
            "priority, created_by) values (:id, :ws, :name, :mtid, :atid, 'medium', :uid)",
            id=sid, ws=user["workspace_id"], name=f"{template['name']} — {item['maintenance_type_name']}",
            mtid=item["maintenance_type_id"], atid=template["asset_type_id"], uid=user["id"],
        )
        await _replace_schedule_children(
            sid, user["workspace_id"], body.vehicle_ids, body.asset_ids,
            [ScheduleIntervalIn(trigger_type=item["trigger_type"], every_n=item["every_n"], unit=item["unit"])], [],
        )
        await _ensure_due_state_rows(user["workspace_id"], sid)
        created_ids.append(sid)
    await log_event(user, "maintenance_template.applied", "maintenance_template", tid, {"schedules_created": len(created_ids)})
    return {"schedule_ids": created_ids}

# --- Quote approvals (Workshop -> Operations Manager -> Finance) ---
OPS_ROLES = ("operations_manager", "admin")
FINANCE_ROLES = ("finance", "admin")
REQUISITION_APPROVER_ROLES = ("workshop_head", "admin")

async def _notify(ws: str, roles: tuple, ntype: str, message: str, maintenance_id: str):
    """Writes one notification row per matching user in the workspace — recipients are resolved to
    concrete user ids at write time since a workspace can have several ops/finance users."""
    recipients = await fetch_all(
        "select id from user_profiles where workspace_id = :ws and role = any(:roles)", ws=ws, roles=list(roles),
    )
    for r in recipients:
        await execute(
            "insert into notifications (id, workspace_id, recipient_user_id, type, message, related_maintenance_id) "
            "values (:id, :ws, :uid, :type, :message, :mid)",
            id=str(uuid.uuid4()), ws=ws, uid=r["id"], type=ntype, message=message, mid=maintenance_id,
        )

@api.get("/maintenance/{mid}/quotes")
async def list_quotes(mid: str, user: dict = Depends(get_current_user)):
    if user.get("role") == "mechanic":
        job = await fetch_one("select assigned_to from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
        if not job or job.get("assigned_to") != str(user["id"]):
            raise HTTPException(status_code=404, detail="Maintenance job not found")
    return await fetch_all(
        "select * from quotes where workspace_id = :ws and maintenance_id = :mid order by created_at desc",
        ws=user["workspace_id"], mid=mid,
    )

async def _create_quote(ws: str, mid: str, job_title: str, items: List[QuoteItem],
                         attachments: List[QuoteAttachment], submitted_by_id: str, submitted_by_name: str) -> str:
    """Shared quote-insert + Ops-notify logic, used by both the manual quote endpoint and the
    parts-requisition shortfall auto-escalation — a requisition shortfall becomes a quote exactly the
    same way a manually-submitted one does, so it flows through the existing Ops->Finance chain unchanged."""
    subtotal = sum(i.qty * i.unit_cost for i in items)
    vat_total = sum(i.qty * i.unit_cost * (i.vat_pct / 100) for i in items)
    qid = str(uuid.uuid4())
    await execute(
        "insert into quotes (id, workspace_id, maintenance_id, items, attachments, subtotal, vat_total, total, "
        "stage, submitted_by, submitted_by_name) values (:id, :ws, :mid, :items ::jsonb, :attachments ::jsonb, "
        ":subtotal, :vat_total, :total, 'pending_ops', :uid, :uname)",
        id=qid, ws=ws, mid=mid,
        items=json_dumps([i.model_dump() for i in items]),
        attachments=json_dumps([a.model_dump() for a in attachments]),
        subtotal=round(subtotal, 2), vat_total=round(vat_total, 2), total=round(subtotal + vat_total, 2),
        uid=submitted_by_id, uname=submitted_by_name,
    )
    await _notify(ws, OPS_ROLES, "quote_submitted", f"{submitted_by_name} submitted a quote for {job_title}", mid)
    return qid

@api.post("/maintenance/{mid}/quotes")
async def create_quote(mid: str, q: QuoteIn, user: dict = Depends(require_module("quotes", "full"))):
    # Gated by the "quotes" System Right (not a hardcoded role tuple) so a workspace without a
    # Workshop Manager can grant this to Operations or Finance instead via Team permissions.
    # workshop_head/admin/manager get "full" by default (_default_permissions); every other role
    # defaults to "read" (can view costing, same as the requisition-shortfall auto-escalation path
    # in _create_quote already gives them) until an admin explicitly upgrades them.
    job = await fetch_one("select * from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
    if not job: raise HTTPException(status_code=404, detail="Maintenance job not found")
    if len(q.attachments) > 5:
        raise HTTPException(status_code=400, detail="A quote can have at most 5 attachments")
    qid = await _create_quote(user["workspace_id"], mid, job["title"], q.items, q.attachments, user["id"], user["name"])
    total = round(sum(i.qty * i.unit_cost * (1 + i.vat_pct / 100) for i in q.items), 2)
    await log_event(user, "quote.submitted", "quote", mid, {"quote_id": qid, "total": total})
    return await fetch_one("select * from quotes where id = :id", id=qid)

@api.post("/quotes/{qid}/decide")
async def decide_quote(qid: str, body: QuoteDecision, user: dict = Depends(get_current_user)):
    quote = await fetch_one("select * from quotes where id = :id and workspace_id = :ws", id=qid, ws=user["workspace_id"])
    if not quote: raise HTTPException(status_code=404, detail="Quote not found")
    if quote["stage"] not in ("pending_ops", "pending_finance"):
        raise HTTPException(status_code=400, detail="This quote has already been decided")
    stage_roles = OPS_ROLES if quote["stage"] == "pending_ops" else FINANCE_ROLES
    if user.get("role") not in stage_roles:
        raise HTTPException(status_code=403, detail="You aren't authorized to decide this quote at its current stage")
    if body.decision == "rejected" and not (body.reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required to reject a quote")
    job = await fetch_one("select * from maintenance where id = :id", id=quote["maintenance_id"])
    decision = {"by": user["id"], "by_name": user["name"], "decision": body.decision, "reason": body.reason or "", "at": datetime.now(timezone.utc).isoformat()}

    if quote["stage"] == "pending_ops":
        await execute("update quotes set ops_decision = :d ::jsonb where id = :id", id=qid, d=json_dumps(decision))
        if body.decision == "approved":
            await execute("update quotes set stage = 'pending_finance' where id = :id", id=qid)
            await _notify(user["workspace_id"], FINANCE_ROLES, "quote_ops_approved",
                          f"Quote for {job['title']} approved by Operations — awaiting Finance", quote["maintenance_id"])
        else:
            await execute("update quotes set stage = 'rejected' where id = :id", id=qid)
        submitter_role_msg = f"Quote for {job['title']} was {'approved' if body.decision == 'approved' else 'rejected'} by Operations"
        if quote.get("submitted_by"):
            await execute(
                "insert into notifications (id, workspace_id, recipient_user_id, type, message, related_maintenance_id) "
                "values (:id, :ws, :uid, :type, :message, :mid)",
                id=str(uuid.uuid4()), ws=user["workspace_id"], uid=quote["submitted_by"],
                type="quote_ops_approved" if body.decision == "approved" else "quote_ops_rejected",
                message=submitter_role_msg + (f" — {body.reason}" if body.decision == "rejected" else ""),
                mid=quote["maintenance_id"],
            )
        await log_event(user, f"quote.ops_{body.decision}", "quote", str(quote["maintenance_id"]), {"quote_id": qid, "reason": body.reason})
    else:
        await execute("update quotes set finance_decision = :d ::jsonb where id = :id", id=qid, d=json_dumps(decision))
        if body.decision == "approved":
            po_count = (await fetch_one("select count(*) as c from purchase_orders where workspace_id = :ws", ws=user["workspace_id"]))["c"]
            po_number = f"PO-{datetime.now(timezone.utc).year}-{po_count + 1:04d}"
            poid = str(uuid.uuid4())
            await execute(
                "insert into purchase_orders (id, workspace_id, po_number, quote_id, maintenance_id, amount, status, created_by) "
                "values (:id, :ws, :po_number, :qid, :mid, :amount, 'po_issued', :uid)",
                id=poid, ws=user["workspace_id"], po_number=po_number, qid=qid, mid=quote["maintenance_id"],
                amount=quote["total"], uid=user["id"],
            )
            await execute("update quotes set stage = 'approved', po_id = :poid where id = :id", id=qid, poid=poid)
            if quote.get("submitted_by"):
                await execute(
                    "insert into notifications (id, workspace_id, recipient_user_id, type, message, related_maintenance_id) "
                    "values (:id, :ws, :uid, 'po_issued', :message, :mid)",
                    id=str(uuid.uuid4()), ws=user["workspace_id"], uid=quote["submitted_by"],
                    message=f"Quote for {job['title']} approved by Finance — {po_number} issued", mid=quote["maintenance_id"],
                )
        else:
            await execute("update quotes set stage = 'rejected' where id = :id", id=qid)
            if quote.get("submitted_by"):
                await execute(
                    "insert into notifications (id, workspace_id, recipient_user_id, type, message, related_maintenance_id) "
                    "values (:id, :ws, :uid, 'quote_finance_rejected', :message, :mid)",
                    id=str(uuid.uuid4()), ws=user["workspace_id"], uid=quote["submitted_by"],
                    message=f"Quote for {job['title']} was rejected by Finance — {body.reason}", mid=quote["maintenance_id"],
                )
        await log_event(user, f"quote.finance_{body.decision}", "quote", str(quote["maintenance_id"]), {"quote_id": qid, "reason": body.reason})
    return await fetch_one("select * from quotes where id = :id", id=qid)

# --- Parts requisitions (Technician -> Workshop Manager; shortfall escalates into the quote chain above) ---
@api.get("/maintenance/{mid}/parts-requisitions")
async def list_requisitions_for_job(mid: str, user: dict = Depends(get_current_user)):
    if user.get("role") == "mechanic":
        job = await fetch_one("select assigned_to from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
        # str() -- assigned_to is text, user["id"] decodes as uuid.UUID; see the identical fix on the
        # other three mechanic-ownership checks in this file (get_maintenance, list_quotes).
        if not job or job.get("assigned_to") != str(user["id"]):
            raise HTTPException(status_code=404, detail="Maintenance job not found")
    return await fetch_all(
        "select * from parts_requisitions where workspace_id = :ws and maintenance_id = :mid order by created_at desc",
        ws=user["workspace_id"], mid=mid,
    )

@api.get("/parts-requisitions")
async def list_requisitions(user: dict = Depends(require_module("parts_requisitions", "read"))):
    return await fetch_all(
        "select * from parts_requisitions where workspace_id = :ws order by created_at desc", ws=user["workspace_id"],
    )

@api.post("/maintenance/{mid}/parts-requisitions")
async def create_requisition(mid: str, body: PartRequisitionIn, user: dict = Depends(require_module("parts_requisitions", "full"))):
    job = await fetch_one("select * from maintenance where id = :id and workspace_id = :ws", id=mid, ws=user["workspace_id"])
    if not job: raise HTTPException(status_code=404, detail="Maintenance job not found")
    if body.client_submission_id:
        existing = await fetch_one(
            "select * from parts_requisitions where workspace_id = :ws and client_submission_id = :cid",
            ws=user["workspace_id"], cid=body.client_submission_id,
        )
        if existing:
            return existing
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one part is required")
    part_ids = [i.part_id for i in body.items]
    parts = await fetch_all("select * from parts where workspace_id = :ws and id = any(:ids)", ws=user["workspace_id"], ids=part_ids)
    pmap = {str(p["id"]): p for p in parts}
    if len(pmap) != len(set(part_ids)):
        raise HTTPException(status_code=400, detail="One or more parts were not found")
    items = [
        {"part_id": i.part_id, "part_name": pmap[i.part_id]["name"], "qty_requested": i.qty_requested,
         "unit_cost": float(pmap[i.part_id].get("unit_cost") or 0)}
        for i in body.items
    ]
    rid = str(uuid.uuid4())
    await execute(
        "insert into parts_requisitions (id, workspace_id, maintenance_id, items, status, requested_by, requested_by_name, client_submission_id) "
        "values (:id, :ws, :mid, :items ::jsonb, 'pending_approval', :uid, :uname, :cid)",
        id=rid, ws=user["workspace_id"], mid=mid, items=json_dumps(items), uid=user["id"], uname=user["name"],
        cid=body.client_submission_id,
    )
    await _notify(user["workspace_id"], REQUISITION_APPROVER_ROLES, "part_requisition_submitted",
                  f"{user['name']} requested parts for {job['title']}", mid)
    await log_event(user, "part_requisition.submitted", "parts_requisition", mid, {"requisition_id": rid, "items": len(items)})
    return await fetch_one("select * from parts_requisitions where id = :id", id=rid)

@api.post("/parts-requisitions/{rid}/decide")
async def decide_requisition(rid: str, body: PartRequisitionDecision, user: dict = Depends(get_current_user)):
    req = await fetch_one("select * from parts_requisitions where id = :id and workspace_id = :ws", id=rid, ws=user["workspace_id"])
    if not req: raise HTTPException(status_code=404, detail="Requisition not found")
    if req["status"] != "pending_approval":
        raise HTTPException(status_code=400, detail="This requisition has already been decided")
    if user.get("role") not in REQUISITION_APPROVER_ROLES:
        raise HTTPException(status_code=403, detail="You aren't authorized to decide part requisitions")
    if body.decision == "rejected" and not (body.reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required to reject a requisition")
    job = await fetch_one("select * from maintenance where id = :id", id=req["maintenance_id"])
    decision = {"by": user["id"], "by_name": user["name"], "reason": body.reason or "", "at": datetime.now(timezone.utc).isoformat()}

    resulting_quote_id = None
    if body.decision == "approved":
        shortfall_items = []
        parts_cost_delta = 0.0
        for line in req["items"]:
            part = await fetch_one("select * from parts where id = :id and workspace_id = :ws", id=line["part_id"], ws=user["workspace_id"])
            live_stock = float(part.get("stock") or 0) if part else 0.0
            qty_requested = float(line["qty_requested"])
            unit_cost = float(line.get("unit_cost") or 0)
            qty_from_stock = min(qty_requested, live_stock)
            qty_short = qty_requested - qty_from_stock
            if qty_from_stock > 0 and part:
                new_stock = max(0.0, live_stock - qty_from_stock)
                await execute("update parts set stock = :stock where id = :id and workspace_id = :ws",
                              stock=new_stock, id=part["id"], ws=user["workspace_id"])
                await execute(
                    "insert into parts_history (id, workspace_id, part_id, delta, reason, by) "
                    "values (:id, :ws, :part_id, :delta, :reason, :by)",
                    id=str(uuid.uuid4()), ws=user["workspace_id"], part_id=part["id"],
                    delta=-qty_from_stock, reason=f"requisition:{rid}", by=user["id"],
                )
                parts_cost_delta += qty_from_stock * unit_cost
                await _maybe_reorder_email({**part, "stock": new_stock}, user["workspace_id"])
            if qty_short > 0:
                shortfall_items.append(QuoteItem(
                    type="part", description=line["part_name"], qty=qty_short, unit_cost=unit_cost, vat_pct=0,
                ))
        if parts_cost_delta > 0:
            await execute(
                "update maintenance set parts_cost = coalesce(parts_cost, 0) + :delta where id = :id and workspace_id = :ws",
                delta=parts_cost_delta, id=req["maintenance_id"], ws=user["workspace_id"],
            )
        if shortfall_items:
            resulting_quote_id = await _create_quote(
                user["workspace_id"], req["maintenance_id"], job["title"], shortfall_items, [],
                req["requested_by"], req["requested_by_name"],
            )
        await execute(
            "update parts_requisitions set status = 'approved', decision = :d ::jsonb, resulting_quote_id = :qid where id = :id",
            id=rid, d=json_dumps(decision), qid=resulting_quote_id,
        )
    else:
        await execute(
            "update parts_requisitions set status = 'rejected', decision = :d ::jsonb where id = :id",
            id=rid, d=json_dumps(decision),
        )

    if req.get("requested_by"):
        msg = f"Your parts request for {job['title']} was {body.decision} by {user['name']}"
        if body.decision == "rejected": msg += f" — {body.reason}"
        elif resulting_quote_id: msg += " (a quote was created for the out-of-stock portion)"
        await execute(
            "insert into notifications (id, workspace_id, recipient_user_id, type, message, related_maintenance_id) "
            "values (:id, :ws, :uid, :type, :message, :mid)",
            id=str(uuid.uuid4()), ws=user["workspace_id"], uid=req["requested_by"],
            type=f"part_requisition_{body.decision}", message=msg, mid=req["maintenance_id"],
        )
    await log_event(user, f"part_requisition.{body.decision}", "parts_requisition", str(req["maintenance_id"]),
                     {"requisition_id": rid, "reason": body.reason, "resulting_quote_id": resulting_quote_id})
    return await fetch_one("select * from parts_requisitions where id = :id", id=rid)

# --- Purchase orders ---
@api.get("/purchase-orders")
async def list_purchase_orders(user: dict = Depends(get_current_user)):
    if user.get("role") == "mechanic":
        return await fetch_all(
            "select * from purchase_orders where workspace_id = :ws and maintenance_id in "
            "(select id from maintenance where assigned_to = :uid) order by created_at desc",
            ws=user["workspace_id"], uid=str(user["id"]),
        )
    return await fetch_all(
        "select * from purchase_orders where workspace_id = :ws order by created_at desc", ws=user["workspace_id"],
    )

@api.post("/purchase-orders")
async def create_purchase_order(po: PurchaseOrderIn, user: dict = Depends(require_module("purchase_orders", "full"))):
    poid = str(uuid.uuid4())
    po_count = (await fetch_one("select count(*) as c from purchase_orders where workspace_id = :ws", ws=user["workspace_id"]))["c"]
    po_number = f"PO-{datetime.now(timezone.utc).year}-{po_count + 1:04d}"
    await execute(
        "insert into purchase_orders (id, workspace_id, po_number, maintenance_id, supplier, amount, status, notes, created_by) "
        "values (:id, :ws, :po_number, :maintenance_id, :supplier, :amount, 'pending_approval', :notes, :uid)",
        id=poid, ws=user["workspace_id"], po_number=po_number, uid=user["id"], **po.model_dump(),
    )
    await log_event(user, "purchase_order.created", "purchase_order", poid, {"po_number": po_number, "amount": po.amount})
    return await fetch_one("select * from purchase_orders where id = :id", id=poid)

@api.post("/purchase-orders/{poid}/mark-paid")
async def mark_purchase_order_paid(poid: str, body: POMarkPaid, user: dict = Depends(require_role(*FINANCE_ROLES))):
    po = await fetch_one("select * from purchase_orders where id = :id and workspace_id = :ws", id=poid, ws=user["workspace_id"])
    if not po: raise HTTPException(status_code=404, detail="Purchase order not found")
    if po["status"] != "po_issued":
        raise HTTPException(status_code=400, detail="Only an issued purchase order can be marked paid")
    if not body.proof_of_payment:
        raise HTTPException(status_code=400, detail="At least one proof-of-payment attachment is required")
    await execute(
        "update purchase_orders set status = 'paid', paid_at = now(), paid_by = :uid, proof_of_payment = :pop ::jsonb "
        "where id = :id and workspace_id = :ws",
        id=poid, ws=user["workspace_id"], uid=user["id"],
        pop=json_dumps([a.model_dump() for a in body.proof_of_payment]),
    )
    await log_event(user, "purchase_order.paid", "purchase_order", poid, {"po_number": po["po_number"]})
    return await fetch_one("select * from purchase_orders where id = :id", id=poid)

# --- Notifications ---
@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    return await fetch_all(
        "select * from notifications where recipient_user_id = :uid order by created_at desc limit 100", uid=user["id"],
    )

@api.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user: dict = Depends(get_current_user)):
    await execute("update notifications set read = true where id = :id and recipient_user_id = :uid", id=nid, uid=user["id"])
    return {"ok": True}

@api.post("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await execute("update notifications set read = true where recipient_user_id = :uid and read = false", uid=user["id"])
    return {"ok": True}

# --- KPIs / Analytics ---
@api.get("/analytics/kpi")
async def analytics_kpi(user: dict = Depends(get_current_user)):
    ws = user["workspace_id"]
    vehicles = await fetch_all("select * from vehicles where workspace_id = :ws", ws=ws)
    maint = await fetch_all("select * from maintenance where workspace_id = :ws", ws=ws)
    fuel_logs = await fetch_all("select * from fuel_logs where workspace_id = :ws", ws=ws)
    parts = await fetch_all("select * from parts where workspace_id = :ws", ws=ws)
    inspections = await fetch_all("select answers, fail_count, vehicle_id, asset_id from inspections where workspace_id = :ws", ws=ws)
    # Scope every vehicle/asset-linked source list before aggregating — a KPI summary computed from
    # unscoped sources would leak fleet-wide totals to a user restricted to part of the fleet.
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    vehicles = _scope_filter(vehicles, allowed_vehicles, None, vehicle_field="id", asset_field=None)
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
    fuel_logs = _scope_filter(fuel_logs, allowed_vehicles, None)
    inspections = _scope_filter(inspections, allowed_vehicles, allowed_assets)
    vmap = {v["id"]: v for v in vehicles}
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
    total_downtime_cost = sum(
        (m.get("downtime_hours", 0) or 0) * (vmap.get(m.get("vehicle_id"), {}).get("downtime_cost_per_hour", 0) or 0)
        for m in completed_jobs
    )
    total_odo = sum(v.get("odometer", 0) or 0 for v in vehicles)
    total_fuel_cost = sum(l.get("cost", 0) or 0 for l in fuel_logs)
    total_fleet_cost = total_maint_cost + total_fuel_cost + total_downtime_cost
    cost_per_vehicle = (total_maint_cost / total_vehicles) if total_vehicles else 0
    utilization = (active / total_vehicles * 100) if total_vehicles else 0
    tyre_cost = sum(m.get("actual_cost", 0) or 0 for m in completed_jobs if m.get("category") == "tyres")

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    def _dt(x):
        if isinstance(x, datetime): return x
        return None
    monthly_jobs = [m for m in completed_jobs if (_dt(m.get("completed_at") or m.get("created_at")) or now) >= month_start]
    monthly_maint = sum(m.get("actual_cost", 0) or 0 for m in monthly_jobs)
    monthly_downtime_cost = sum(
        (m.get("downtime_hours", 0) or 0) * (vmap.get(m.get("vehicle_id"), {}).get("downtime_cost_per_hour", 0) or 0)
        for m in monthly_jobs
    )
    monthly_fuel = sum(l.get("cost", 0) or 0 for l in fuel_logs if (_dt(l.get("occurred_at")) or now) >= month_start)
    total_monthly_cost = monthly_maint + monthly_downtime_cost + monthly_fuel

    on_budget = sum(1 for m in completed_jobs if (m.get("actual_cost", 0) or 0) <= (m.get("estimated_cost", 0) or 0))
    cost_efficiency_pct = (on_budget / len(completed_jobs) * 100) if completed_jobs else 100

    by_supplier = {}
    for p in parts:
        by_supplier.setdefault(p.get("supplier") or "Unknown", []).append(p.get("unit_cost", 0) or 0)
    supplier_avgs = [sum(v) / len(v) for v in by_supplier.values() if v]
    vendor_avg_cost = (sum(supplier_avgs) / len(supplier_avgs)) if supplier_avgs else 0

    avg_downtime_days_per_vehicle = (total_downtime / 24 / total_vehicles) if total_vehicles else 0

    total_defects = sum(1 for i in inspections for a in (i.get("answers") or []) if a.get("value") == "fail")
    failed_checklists = sum(1 for i in inspections if (i.get("fail_count") or 0) > 0)

    driver_scores = await _compute_driver_performance(ws)
    avg_driver_score = (sum(d["score"] for d in driver_scores) / len(driver_scores)) if driver_scores else 0

    driver_cost = {}
    for m in completed_jobs:
        if m.get("driver_id"):
            driver_cost[m["driver_id"]] = driver_cost.get(m["driver_id"], 0) + (m.get("actual_cost", 0) or 0)
    for f in fuel_logs:
        if f.get("driver_id"):
            driver_cost[f["driver_id"]] = driver_cost.get(f["driver_id"], 0) + (f.get("cost", 0) or 0)
    driver_highest_cost = max(driver_cost.values()) if driver_cost else 0

    trip_logs = await fetch_all("select vehicle_id from trip_logs where workspace_id = :ws", ws=ws)
    trip_logs = _scope_filter(trip_logs, allowed_vehicles, None)
    avg_trips_per_vehicle = (len(trip_logs) / total_vehicles) if total_vehicles else 0

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
        "total_downtime_cost": round(total_downtime_cost, 2),
        "total_fleet_cost": round(total_fleet_cost, 2),
        "cost_per_vehicle": round(cost_per_vehicle, 2),
        "pending_jobs": len(pending_jobs),
        "completed_jobs": len(completed_jobs),
        "total_km": round(total_odo, 0),
        "tyre_cost": round(tyre_cost, 2),
        "total_monthly_cost": round(total_monthly_cost, 2),
        "cost_efficiency_pct": round(cost_efficiency_pct, 1),
        "vendor_avg_cost": round(vendor_avg_cost, 2),
        "avg_downtime_days_per_vehicle": round(avg_downtime_days_per_vehicle, 1),
        "total_defects": total_defects,
        "failed_checklists": failed_checklists,
        "avg_driver_score": round(avg_driver_score, 1),
        "driver_highest_cost": round(driver_highest_cost, 2),
        "avg_trips_per_vehicle": round(avg_trips_per_vehicle, 1),
    }

@api.get("/analytics/cost-trend")
async def cost_trend(user: dict = Depends(get_current_user)):
    # NOTE: was missing a workspace filter entirely in the Mongo version (cross-tenant leak) — fixed here.
    maint = await fetch_all(
        "select * from maintenance where workspace_id = :ws and status = 'completed'", ws=user["workspace_id"],
    )
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
    buckets = {}
    for m in maint:
        d = m.get("completed_at") or m.get("created_at") or datetime.now(timezone.utc)
        month = d.strftime("%Y-%m")
        buckets.setdefault(month, {"month": month, "parts": 0, "labor": 0, "total": 0})
        buckets[month]["parts"] += m.get("parts_cost", 0) or 0
        buckets[month]["labor"] += m.get("labor_cost", 0) or 0
        buckets[month]["total"] += m.get("actual_cost", 0) or 0
    return sorted(buckets.values(), key=lambda x: x["month"])

@api.get("/analytics/cost-by-category")
async def cost_by_category(user: dict = Depends(get_current_user)):
    maint = await fetch_all(
        "select * from maintenance where workspace_id = :ws and status = 'completed'", ws=user["workspace_id"],
    )
    fuel_logs = await fetch_all("select cost, vehicle_id from fuel_logs where workspace_id = :ws", ws=user["workspace_id"])
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
    fuel_logs = _scope_filter(fuel_logs, allowed_vehicles, None)
    total_parts = sum(m.get("parts_cost", 0) or 0 for m in maint)
    total_labor = sum(m.get("labor_cost", 0) or 0 for m in maint)
    total_fuel = sum(f.get("cost", 0) or 0 for f in fuel_logs)
    return [
        {"name": "Parts", "value": round(total_parts, 2)},
        {"name": "Labor", "value": round(total_labor, 2)},
        {"name": "Fuel", "value": round(total_fuel, 2)},
    ]

MAINT_CATEGORIES = ["tyres", "engine", "brakes", "electrical", "bodywork", "general"]

async def _budget_summary(ws: str, year: int, allowed_vehicles=None, allowed_assets=None) -> list:
    """Per-category budget vs actual for a year — actual is real completed-maintenance actual_cost,
    keyed to maintenance.category since that's the only cost axis with real data attached (the
    prototype's Preventive Maintenance/Emergency Repairs/Workshop Costs taxonomy has no FleetIntel
    equivalent). allowed_vehicles/allowed_assets of None means unrestricted — callers that don't
    pass them (e.g. set_budgets, an admin/finance write action) get the unscoped fleet-wide view."""
    budgets = await fetch_all("select * from budgets where workspace_id = :ws and year = :year", ws=ws, year=year)
    bmap = {b["category"]: float(b["amount"] or 0) for b in budgets}
    maint = await fetch_all(
        "select category, actual_cost, completed_at, vehicle_id, asset_id from maintenance where workspace_id = :ws and status = 'completed'", ws=ws,
    )
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
    actual = {c: 0.0 for c in MAINT_CATEGORIES}
    for m in maint:
        d = m.get("completed_at")
        if d and d.year == year:
            actual[m.get("category") or "general"] = actual.get(m.get("category") or "general", 0) + float(m.get("actual_cost", 0) or 0)
    rows = []
    for cat in MAINT_CATEGORIES:
        budget = bmap.get(cat, 0)
        act = round(actual.get(cat, 0), 2)
        if budget > 0:
            utilization = round((act / budget) * 100, 1)
            status = "over_budget" if utilization > 100 else "near_limit" if utilization >= 90 else "on_track"
        else:
            # No budget set for this category — any spend at all is unbudgeted, not "on track".
            utilization = 100.0 if act > 0 else 0.0
            status = "over_budget" if act > 0 else "on_track"
        rows.append({"category": cat, "budget": budget, "actual": act, "variance": round(act - budget, 2),
                      "utilization": utilization, "status": status})
    return rows

@api.get("/budgets/summary")
async def budgets_summary(year: int = None, user: dict = Depends(get_current_user)):
    year = year or datetime.now(timezone.utc).year
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    rows = await _budget_summary(user["workspace_id"], year, allowed_vehicles, allowed_assets)
    monthly = {}
    maint = await fetch_all(
        "select category, actual_cost, completed_at, vehicle_id, asset_id from maintenance where workspace_id = :ws and status = 'completed'",
        ws=user["workspace_id"],
    )
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
    for m in maint:
        d = m.get("completed_at")
        if d and d.year == year:
            mo = d.strftime("%Y-%m")
            monthly[mo] = monthly.get(mo, 0) + float(m.get("actual_cost", 0) or 0)
    return {
        "year": year,
        "categories": rows,
        "ytd_budget": round(sum(r["budget"] for r in rows), 2),
        "ytd_actual": round(sum(r["actual"] for r in rows), 2),
        "monthly": [{"month": mo, "actual": round(v, 2)} for mo, v in sorted(monthly.items())],
    }

@api.put("/budgets")
async def set_budgets(rows: List[dict], user: dict = Depends(require_module("reports", "full"))):
    """Upserts one row per {category, year, amount} — the whole per-category table is saved at once
    from the Budget vs Actual page rather than one PATCH per cell."""
    for r in rows:
        if r.get("category") not in MAINT_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Unknown category: {r.get('category')}")
        await execute(
            "insert into budgets (id, workspace_id, category, year, amount, created_by) "
            "values (:id, :ws, :category, :year, :amount, :uid) "
            "on conflict (workspace_id, category, year) do update set amount = :amount",
            id=str(uuid.uuid4()), ws=user["workspace_id"], category=r["category"],
            year=int(r["year"]), amount=float(r.get("amount") or 0), uid=user["id"],
        )
    await log_event(user, "budgets.updated", "budget", "", {"year": rows[0]["year"] if rows else None})
    return await _budget_summary(user["workspace_id"], rows[0]["year"] if rows else datetime.now(timezone.utc).year)

@api.get("/analytics/vehicle-cost")
async def vehicle_cost(user: dict = Depends(get_current_user)):
    vehicles = await fetch_all("select * from vehicles where workspace_id = :ws", ws=user["workspace_id"])
    maint = await fetch_all(
        "select * from maintenance where workspace_id = :ws and status = 'completed'", ws=user["workspace_id"],
    )
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    vehicles = vehicles if allowed_vehicles is None else [v for v in vehicles if str(v["id"]) in allowed_vehicles]
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
    result = []
    for v in vehicles:
        cost = sum(m.get("actual_cost", 0) or 0 for m in maint if m.get("vehicle_id") == v["id"])
        result.append({"vehicle_id": v["id"], "vehicle": v["name"], "plate": v["plate"], "cost": round(cost, 2)})
    return sorted(result, key=lambda x: x["cost"], reverse=True)


@api.get("/analytics/executive-dashboard")
async def executive_dashboard(user: dict = Depends(require_module("executive_dashboard", "read"))):
    """Management-level cost rollup. Cost buckets are defined by cost COMPONENT, not job category,
    since a maintenance job has one total made of labor_cost + parts_cost and "tyres" is just one of
    six job categories — there's no clean non-overlapping 3-way split otherwise:
      - Maintenance = sum(labor_cost) across completed jobs
      - Parts       = sum(parts_cost) across completed jobs
      - Tyres       = sum(actual_cost) of jobs where category = 'tyres' specifically (shown as its
                       own slice; understood to overlap with the other two since a tyre job also has
                       labor+parts — this is "how much did tyre-category work cost", not a disjoint
                       bucket, per explicit product decision).
    """
    ws = user["workspace_id"]
    vehicles = await fetch_all("select * from vehicles where workspace_id = :ws", ws=ws)
    groups = await fetch_all("select * from vehicle_groups where workspace_id = :ws", ws=ws)
    maint = await fetch_all("select * from maintenance where workspace_id = :ws and status = 'completed'", ws=ws)
    parts = await fetch_all("select * from parts where workspace_id = :ws", ws=ws)
    parts_history = await fetch_all("select * from parts_history where workspace_id = :ws", ws=ws)

    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    vehicles = vehicles if allowed_vehicles is None else [v for v in vehicles if str(v["id"]) in allowed_vehicles]
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)

    vmap = {v["id"]: v for v in vehicles}
    gmap = {g["id"]: g for g in groups}
    now = datetime.now(timezone.utc)

    def _f(x):
        # asyncpg decodes Postgres `numeric` columns as decimal.Decimal, which can't mix with float
        # in arithmetic (Decimal * float raises TypeError) — normalize every numeric read once here.
        return float(x) if x is not None else 0.0

    def _dt(m):
        d = m.get("completed_at") or m.get("created_at")
        return d if isinstance(d, datetime) else now

    def _bucket_costs(rows):
        maintenance = sum(_f(m.get("labor_cost")) for m in rows)
        parts_c = sum(_f(m.get("parts_cost")) for m in rows)
        tyres = sum(_f(m.get("actual_cost")) for m in rows if m.get("category") == "tyres")
        return round(maintenance, 2), round(tyres, 2), round(parts_c, 2)

    # --- KPI tiles: this month vs last month ---
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_end = month_start - timedelta(seconds=1)
    last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month_jobs = [m for m in maint if _dt(m) >= month_start]
    last_month_jobs = [m for m in maint if last_month_start <= _dt(m) <= last_month_end]
    m_maint, m_tyres, m_parts = _bucket_costs(this_month_jobs)
    l_maint, l_tyres, l_parts = _bucket_costs(last_month_jobs)

    def _delta_pct(cur, prev):
        if not prev:
            return 0.0 if not cur else 100.0
        return round((cur - prev) / prev * 100, 1)

    cost_per_vehicle = round((m_maint + m_tyres + m_parts) / len(vehicles), 2) if vehicles else 0
    last_cost_per_vehicle = round((l_maint + l_tyres + l_parts) / len(vehicles), 2) if vehicles else 0

    kpis = {
        "maintenance": {"value": m_maint, "delta_pct": _delta_pct(m_maint, l_maint)},
        "tyres": {"value": m_tyres, "delta_pct": _delta_pct(m_tyres, l_tyres)},
        "parts": {"value": m_parts, "delta_pct": _delta_pct(m_parts, l_parts)},
        "cost_per_vehicle": {"value": cost_per_vehicle, "delta_pct": _delta_pct(cost_per_vehicle, last_cost_per_vehicle)},
    }

    # --- 6-month trailing trend ---
    # Build the last 6 calendar-month keys explicitly (avoids a relativedelta dependency).
    month_keys = []
    y, mo = now.year, now.month
    for _ in range(6):
        month_keys.append(f"{y:04d}-{mo:02d}")
        mo -= 1
        if mo == 0:
            mo = 12
            y -= 1
    month_keys.reverse()
    trend_buckets = {k: [] for k in month_keys}
    for m in maint:
        key = _dt(m).strftime("%Y-%m")
        if key in trend_buckets:
            trend_buckets[key].append(m)
    monthly_trend = []
    for k in month_keys:
        mm, tt, pp = _bucket_costs(trend_buckets[k])
        monthly_trend.append({"month": k, "maintenance": mm, "tyres": tt, "parts": pp, "total": round(mm + tt + pp, 2)})

    # --- YTD breakdown ---
    ytd_jobs = [m for m in maint if _dt(m).year == now.year]
    y_maint, y_tyres, y_parts = _bucket_costs(ytd_jobs)
    ytd_total = y_maint + y_tyres + y_parts
    ytd_breakdown = [
        {"name": "Maintenance", "value": y_maint, "pct": round(y_maint / ytd_total * 100, 1) if ytd_total else 0},
        {"name": "Tyres", "value": y_tyres, "pct": round(y_tyres / ytd_total * 100, 1) if ytd_total else 0},
        {"name": "Parts", "value": y_parts, "pct": round(y_parts / ytd_total * 100, 1) if ytd_total else 0},
    ]

    # --- Top 6 vehicles by total cost ---
    vcost = {}
    for m in maint:
        if m.get("vehicle_id"):
            vcost[m["vehicle_id"]] = vcost.get(m["vehicle_id"], 0) + _f(m.get("actual_cost"))
    top_vehicles = sorted(
        [{"vehicle_id": vid, "name": vmap[vid]["name"], "value": round(c, 2)} for vid, c in vcost.items() if vid in vmap],
        key=lambda x: x["value"], reverse=True,
    )[:6]

    # --- Cost by region (via vehicle -> group -> region; "Ungrouped" for vehicles with no group/region) ---
    region_cost = {}
    for m in maint:
        vid = m.get("vehicle_id")
        v = vmap.get(vid)
        region = "Ungrouped"
        if v and v.get("group_id") and gmap.get(v["group_id"], {}).get("region"):
            region = gmap[v["group_id"]]["region"]
        region_cost[region] = region_cost.get(region, 0) + _f(m.get("actual_cost"))
    by_region = sorted(
        [{"region": r, "value": round(c, 2)} for r, c in region_cost.items()],
        key=lambda x: x["value"], reverse=True,
    )

    # --- Top suppliers by spend (from maintenance.vendor; "Unknown" for blanks) ---
    supplier_cost = {}
    for m in maint:
        supplier = (m.get("vendor") or "").strip() or "Unknown"
        supplier_cost[supplier] = supplier_cost.get(supplier, 0) + _f(m.get("actual_cost"))
    top_suppliers = sorted(
        [{"supplier": s, "value": round(c, 2)} for s, c in supplier_cost.items()],
        key=lambda x: x["value"], reverse=True,
    )[:6]

    # --- AI Cost Intelligence Insights (rule-based, no LLM) ---
    insights = []

    # 1. Cost spike vs trailing average
    trailing = [b["total"] for b in monthly_trend[:-1]]  # exclude current month
    if trailing:
        avg = sum(trailing) / len(trailing)
        current_total = monthly_trend[-1]["total"]
        if avg > 0 and current_total > avg * 1.2:
            insights.append({
                "id": "cost-spike", "type": "warning", "priority": "High",
                "title": "Maintenance Spend Spike",
                "message": f"This month's total maintenance spend is {round((current_total / avg - 1) * 100)}% above the trailing 6-month average of {round(avg):,}.",
                "impact": f"+{round(current_total - avg):,} vs average",
            })

    # 2. Category cost leader (trailing 90 days)
    cutoff90 = now - timedelta(days=90)
    recent = [m for m in maint if _dt(m) >= cutoff90]
    cat_totals = {}
    for m in recent:
        cat = m.get("category") or "general"
        cat_totals[cat] = cat_totals.get(cat, 0) + _f(m.get("actual_cost"))
    if cat_totals:
        top_cat, top_cat_val = max(cat_totals.items(), key=lambda kv: kv[1])
        if top_cat_val > 0:
            insights.append({
                "id": "category-leader", "type": "info", "priority": "Medium",
                "title": "Top Cost Category",
                "message": f"\"{top_cat.title()}\" is the highest-cost maintenance category this quarter.",
                "impact": f"{round(top_cat_val):,} this quarter",
            })

    # 3. High-cost vehicle vs fleet average
    if len(top_vehicles) >= 2:
        fleet_avg = sum(vcost.values()) / len(vcost) if vcost else 0
        worst = top_vehicles[0]
        if fleet_avg > 0 and worst["value"] > fleet_avg * 1.5:
            insights.append({
                "id": "high-cost-vehicle", "type": "alert", "priority": "High",
                "title": "High Cost Vehicle",
                "message": f"{worst['name']} has cost {round((worst['value'] / fleet_avg - 1) * 100)}% more than the fleet average this period.",
                "impact": f"+{round(worst['value'] - fleet_avg):,} vs average",
            })

    # 4. Recoverable / dead-stock parts — stock on hand with no movement in the last 180 days
    moved_recently = {ph["part_id"] for ph in parts_history if (ph.get("at") or now) >= now - timedelta(days=180)}
    dead_stock = [p for p in parts if _f(p.get("stock")) > 0 and p["id"] not in moved_recently]
    dead_value = sum(_f(p.get("stock")) * _f(p.get("unit_cost")) for p in dead_stock)
    if dead_value > 0:
        insights.append({
            "id": "dead-stock", "type": "success", "priority": "Low",
            "title": "Cost Reduction Opportunity",
            "message": f"{len(dead_stock)} part{'s' if len(dead_stock) != 1 else ''} in inventory have had no recorded movement in 180+ days.",
            "impact": f"{round(dead_value):,} recoverable",
        })

    return {
        "currency_note": "values are in the workspace's configured currency",
        "kpis": kpis,
        "monthly_trend": monthly_trend,
        "ytd_breakdown": ytd_breakdown,
        "top_vehicles": top_vehicles,
        "by_region": by_region,
        "top_suppliers": top_suppliers,
        "insights": insights,
    }

# --- Parts inventory ---
PART_COLS = {"name", "sku", "category", "stock", "reorder_point", "unit_cost", "supplier", "supplier_email"}

@api.get("/parts")
async def list_parts(user: dict = Depends(get_current_user)):
    return await fetch_all("select * from parts where workspace_id = :ws order by name", ws=user["workspace_id"])

@api.get("/parts/alerts")
async def part_alerts(user: dict = Depends(get_current_user)):
    return await fetch_all(
        "select * from parts where workspace_id = :ws and coalesce(stock, 0) <= coalesce(reorder_point, 0)",
        ws=user["workspace_id"],
    )

@api.post("/parts")
async def create_part(p: PartIn, user: dict = Depends(get_current_user)):
    pid = str(uuid.uuid4())
    await execute(
        "insert into parts (id, workspace_id, name, sku, category, stock, reorder_point, unit_cost, "
        "supplier, supplier_email) values (:id, :ws, :name, :sku, :category, :stock, :reorder_point, "
        ":unit_cost, :supplier, :supplier_email)",
        id=pid, ws=user["workspace_id"], **p.model_dump(),
    )
    return await fetch_one("select * from parts where id = :id", id=pid)

@api.patch("/parts/{pid}")
async def update_part(pid: str, patch: dict, user: dict = Depends(get_current_user)):
    await update_row("parts", pid, user["workspace_id"], patch, PART_COLS)
    return await fetch_one("select * from parts where id = :id and workspace_id = :ws", id=pid, ws=user["workspace_id"])

async def _maybe_reorder_email(part: dict, workspace_id: str) -> Optional[str]:
    """Send supplier reorder email if part is at/below reorder point and has an email."""
    if not part.get("supplier_email"): return None
    if (part.get("stock", 0) or 0) > (part.get("reorder_point", 0) or 0): return None
    # Prevent duplicate emails within 24h
    key = f"reorder:{workspace_id}:{part['id']}"
    recent = await fetch_one("select at from email_log where key = :key", key=key)
    if recent and (datetime.now(timezone.utc) - recent["at"]).total_seconds() < 86400:
        return None
    ws = await fetch_one("select name from workspaces where id = :id", id=workspace_id) or {"name": "FleetCost"}
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
    await execute(
        "insert into email_log (key, email_id) values (:key, :email_id) "
        "on conflict (key) do update set at = now(), email_id = :email_id",
        key=key, email_id=email_id,
    )
    return email_id

@api.post("/parts/{pid}/adjust")
async def adjust_part(pid: str, adj: PartAdjust, user: dict = Depends(get_current_user)):
    part = await fetch_one("select * from parts where id = :id and workspace_id = :ws", id=pid, ws=user["workspace_id"])
    if not part: raise HTTPException(status_code=404, detail="Not found")
    was_above = (part.get("stock", 0) or 0) > (part.get("reorder_point", 0) or 0)
    new_stock = max(0, (part.get("stock", 0) or 0) + adj.delta)
    await execute("update parts set stock = :stock where id = :id and workspace_id = :ws", stock=new_stock, id=pid, ws=user["workspace_id"])
    await execute(
        "insert into parts_history (id, workspace_id, part_id, delta, reason, by) "
        "values (:id, :ws, :part_id, :delta, :reason, :by)",
        id=str(uuid.uuid4()), ws=user["workspace_id"], part_id=pid,
        delta=adj.delta, reason=adj.reason or "", by=user["id"],
    )
    updated = await fetch_one("select * from parts where id = :id and workspace_id = :ws", id=pid, ws=user["workspace_id"])
    await log_event(user, "part.adjusted", "part", pid, {"name": part.get("name"), "delta": adj.delta, "new_stock": new_stock})
    # Trigger auto-reorder email if we JUST crossed below threshold
    is_below = new_stock <= (part.get("reorder_point", 0) or 0)
    if was_above and is_below:
        asyncio.create_task(_maybe_reorder_email(updated, user["workspace_id"]))
    return updated

@api.delete("/parts/{pid}")
async def delete_part(pid: str, user: dict = Depends(get_current_user)):
    await execute("delete from parts where id = :id and workspace_id = :ws", id=pid, ws=user["workspace_id"])
    return {"ok": True}

# --- Audit log ---
@api.get("/audit")
async def audit_list(limit: int = 200, entity_id: Optional[str] = None, entity_type: Optional[str] = None, user: dict = Depends(get_current_user)):
    if entity_id:
        return await fetch_all(
            "select * from audit_log where workspace_id = :ws and entity_id = :eid order by at desc limit :limit",
            ws=user["workspace_id"], eid=entity_id, limit=limit,
        )
    if entity_type:
        return await fetch_all(
            "select * from audit_log where workspace_id = :ws and entity_type = :etype order by at desc limit :limit",
            ws=user["workspace_id"], etype=entity_type, limit=limit,
        )
    return await fetch_all(
        "select * from audit_log where workspace_id = :ws order by at desc limit :limit",
        ws=user["workspace_id"], limit=limit,
    )

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
    user = await user_from_token(token) if token else await get_current_user(request)
    jobs = await fetch_all(
        "select * from maintenance where workspace_id = :ws order by created_at desc limit 5000", ws=user["workspace_id"],
    )
    vehicles = {v["id"]: v for v in await fetch_all("select * from vehicles where workspace_id = :ws", ws=user["workspace_id"])}
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
    user = await user_from_token(token) if token else await get_current_user(request)
    parts = await fetch_all("select * from parts where workspace_id = :ws order by name limit 5000", ws=user["workspace_id"])
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

@api.get("/export/inspections.csv")
async def export_inspections(request: Request):
    token = request.query_params.get("token")
    user = await user_from_token(token) if token else await get_current_user(request)
    ws = user["workspace_id"]
    insp = await fetch_all("select * from inspections where workspace_id = :ws order by created_at desc limit 5000", ws=ws)
    vehicles = {v["id"]: v for v in await fetch_all("select * from vehicles where workspace_id = :ws", ws=ws)}
    assets = {a["id"]: a for a in await fetch_all("select * from assets where workspace_id = :ws", ws=ws)}
    templates = {t["id"]: t for t in await fetch_all("select id, name from templates where workspace_id = :ws", ws=ws)}
    rows = []
    for i in insp:
        v = vehicles.get(i.get("vehicle_id"))
        a = assets.get(i.get("asset_id"))
        target = v or a
        rows.append({
            "id": i.get("id", ""), "vehicle": target.get("name", "") if target else "",
            "plate_or_identifier": (v.get("plate") if v else (a.get("identifier") if a else "")) or "",
            "type": "vehicle" if v else (a.get("kind") if a else ""),
            "driver": i.get("inspector_name", ""), "template": templates.get(i.get("template_id"), {}).get("name", ""),
            "completed_at": i.get("completed_at") or i.get("created_at") or "",
            "received_at": i.get("created_at", ""), "address": i.get("address", ""),
            "result": "Defects Found" if (i.get("fail_count") or 0) > 0 else "Pass",
            "defect_count": i.get("fail_count", 0),
        })
    return _csv_response(rows, ["id","vehicle","plate_or_identifier","type","driver","template","completed_at","received_at","address","result","defect_count"], "checklist-register.csv")

@api.get("/export/drivers.csv")
async def export_drivers(group_id: Optional[str] = None, status: Optional[str] = None, request: Request = None):
    token = request.query_params.get("token")
    user = await user_from_token(token) if token else await get_current_user(request)
    ws = user["workspace_id"]
    q = "select * from drivers where workspace_id = :ws"
    params = {"ws": ws}
    if group_id:
        q += " and group_id = :gid"; params["gid"] = group_id
    if status:
        q += " and status = :status"; params["status"] = status
    q += " order by name"
    drivers = await fetch_all(q, **params)
    vehicles = {v["id"]: v for v in await fetch_all("select id, name, plate from vehicles where workspace_id = :ws", ws=ws)}
    rows = []
    for d in drivers:
        v = vehicles.get(d.get("assigned_vehicle_id"))
        rows.append({
            "name": d.get("name", ""), "number": d.get("number", ""), "email": d.get("email", ""),
            "phone": d.get("phone", ""), "vehicle": f"{v['name']} ({v['plate']})" if v else "",
            "status": d.get("status", ""), "license_number": d.get("license_number", ""),
            "license_expiry": d.get("license_expiry", ""),
            "vehicle_checklist_access": (d.get("app_access") or {}).get("vehicle_checklist", False),
        })
    return _csv_response(rows, ["name","number","email","phone","vehicle","status","license_number","license_expiry","vehicle_checklist_access"], "drivers.csv")

@api.get("/export/users.csv")
async def export_users(request: Request):
    token = request.query_params.get("token")
    user = await user_from_token(token) if token else await get_current_user(request)
    users = await fetch_all(f"select {SAFE_USER_COLS} from user_profiles where workspace_id = :ws order by name", ws=user["workspace_id"])
    rows = [{
        "name": u.get("name", ""), "username": u.get("username", ""), "email": u.get("email", ""),
        "role": u.get("role", ""), "status": u.get("status", "active"),
        "active_from": u.get("active_from", "") or "", "active_until": u.get("active_until", "") or "",
    } for u in users]
    return _csv_response(rows, ["name","username","email","role","status","active_from","active_until"], "team-members.csv")

DRIVER_GROUP_COLS = {"name", "color", "description", "department", "region", "cost_centre"}

# --- Driver groups ---
@api.get("/driver-groups")
async def list_driver_groups(user: dict = Depends(get_current_user)):
    return await fetch_all("select * from driver_groups where workspace_id = :ws order by name", ws=user["workspace_id"])

@api.post("/driver-groups")
async def create_driver_group(g: DriverGroupIn, user: dict = Depends(get_current_user)):
    gid = str(uuid.uuid4())
    await execute(
        "insert into driver_groups (id, workspace_id, name, color, description, department, region, cost_centre) "
        "values (:id, :ws, :name, :color, :description, :department, :region, :cost_centre)",
        id=gid, ws=user["workspace_id"], **g.model_dump(),
    )
    doc = await fetch_one("select * from driver_groups where id = :id", id=gid)
    await log_event(user, "driver_group.created", "driver_group", gid, {"name": doc["name"]})
    return doc

@api.patch("/driver-groups/{gid}")
async def update_driver_group(gid: str, patch: dict, user: dict = Depends(get_current_user)):
    before = await fetch_one("select * from driver_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if not before: raise HTTPException(status_code=404, detail="Not found")
    await update_row("driver_groups", gid, user["workspace_id"], patch, DRIVER_GROUP_COLS)
    doc = await fetch_one("select * from driver_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if "color" in patch and patch["color"] != before["color"]:
        await log_event(user, "driver_group.color_changed", "driver_group", gid, {"name": doc["name"], "from": before["color"], "to": doc["color"]})
    else:
        await log_event(user, "driver_group.updated", "driver_group", gid, {"name": doc["name"]})
    return doc

@api.delete("/driver-groups/{gid}")
async def delete_driver_group(gid: str, user: dict = Depends(get_current_user)):
    g = await fetch_one("select * from driver_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    await execute("delete from driver_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if g:
        await log_event(user, "driver_group.deleted", "driver_group", gid, {"name": g["name"]})
    return {"ok": True}

@api.post("/driver-groups/{gid}/assign")
async def assign_driver_group(gid: str, body: GroupAssign, user: dict = Depends(get_current_user)):
    g = await fetch_one("select * from driver_groups where id = :id and workspace_id = :ws", id=gid, ws=user["workspace_id"])
    if not g: raise HTTPException(status_code=404, detail="Not found")
    if body.add_ids:
        await execute(
            "update drivers set group_id = :gid where id = any(:ids) and workspace_id = :ws",
            gid=gid, ids=body.add_ids, ws=user["workspace_id"],
        )
        await log_event(user, "driver_group.member_added", "driver_group", gid, {"name": g["name"], "count": len(body.add_ids), "ids": body.add_ids})
    if body.remove_ids:
        await execute(
            "update drivers set group_id = null where id = any(:ids) and group_id = :gid and workspace_id = :ws",
            gid=gid, ids=body.remove_ids, ws=user["workspace_id"],
        )
        await log_event(user, "driver_group.member_removed", "driver_group", gid, {"name": g["name"], "count": len(body.remove_ids), "ids": body.remove_ids})
    return {"ok": True}

# --- Drivers ---
DRIVER_COLS = {"name", "email", "phone", "license_number", "license_expiry", "hire_date",
               "assigned_vehicle_id", "status", "notes", "group_id",
               "number", "company_department", "cell_country_code", "private", "additional_info",
               "app_access", "identification_method", "regulation", "license_issuing_country",
               "license_issuing_authority", "license_issue_date", "license_categories",
               "address_country", "address_street", "address_zip", "address_city"}

REGULATIONS = ["EU 561/2006", "US FMCSA HOS", "South Africa NRTA", "Not tracked"]

def _validate_driver_app_access(email: Optional[str], app_access: dict):
    if (app_access or {}).get("vehicle_checklist") and not email:
        raise HTTPException(status_code=400, detail="Vehicle Checklist app access requires an email on file — add one in the Driver section first")

@api.get("/drivers")
async def list_drivers(search: Optional[str] = None, limit: Optional[int] = None, offset: int = 0, user: dict = Depends(get_current_user)):
    if search:
        q = "select * from drivers where workspace_id = :ws and name ilike :q order by name"
        params = {"ws": user["workspace_id"], "q": f"%{search}%"}
    else:
        q = "select * from drivers where workspace_id = :ws order by name"
        params = {"ws": user["workspace_id"]}
    if limit is not None:
        q += " limit :limit offset :offset"
        params["limit"] = limit
        params["offset"] = offset
    return await fetch_all(q, **params)

@api.post("/drivers")
async def create_driver(d: dict, user: dict = Depends(get_current_user)):
    # Coerce empty-string email to None before Pydantic validation
    if isinstance(d.get("email"), str) and not d["email"].strip():
        d["email"] = None
    driver = DriverIn(**d)
    _validate_driver_app_access(driver.email, driver.app_access)
    did = str(uuid.uuid4())
    fields = driver.model_dump()
    fields["license_expiry"] = _parse_date(fields["license_expiry"])
    fields["hire_date"] = _parse_date(fields["hire_date"])
    fields["license_issue_date"] = _parse_date(fields["license_issue_date"]) if fields.get("license_issue_date") else None
    fields["app_access"] = json_dumps(fields["app_access"])
    fields["license_categories"] = json_dumps(fields["license_categories"])
    await execute(
        "insert into drivers (id, workspace_id, name, email, phone, license_number, license_expiry, "
        "hire_date, assigned_vehicle_id, status, notes, group_id, number, company_department, "
        "cell_country_code, private, additional_info, app_access, identification_method, regulation, "
        "license_issuing_country, license_issuing_authority, license_issue_date, license_categories, "
        "address_country, address_street, address_zip, address_city) values (:id, :ws, :name, :email, "
        ":phone, :license_number, :license_expiry, :hire_date, :assigned_vehicle_id, :status, :notes, "
        ":group_id, :number, :company_department, :cell_country_code, :private, :additional_info, "
        ":app_access ::jsonb, :identification_method, :regulation, :license_issuing_country, "
        ":license_issuing_authority, :license_issue_date, :license_categories ::jsonb, :address_country, "
        ":address_street, :address_zip, :address_city)",
        id=did, ws=user["workspace_id"], **fields,
    )
    doc = await fetch_one("select * from drivers where id = :id", id=did)
    await log_event(user, "driver.created", "driver", did, {"name": doc["name"]})
    return doc

@api.get("/drivers/{did}")
async def get_driver(did: str, user: dict = Depends(get_current_user)):
    d = await fetch_one("select * from drivers where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])
    if not d: raise HTTPException(status_code=404, detail="Not found")
    return d

@api.patch("/drivers/{did}")
async def update_driver(did: str, patch: dict, user: dict = Depends(get_current_user)):
    current = await fetch_one("select * from drivers where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])
    if not current: raise HTTPException(status_code=404, detail="Not found")
    if "app_access" in patch or "email" in patch:
        email = patch.get("email", current.get("email"))
        app_access = patch.get("app_access", current.get("app_access") or {})
        _validate_driver_app_access(email, app_access)
    if "license_expiry" in patch: patch["license_expiry"] = _parse_date(patch["license_expiry"])
    if "hire_date" in patch: patch["hire_date"] = _parse_date(patch["hire_date"])
    if "license_issue_date" in patch: patch["license_issue_date"] = _parse_date(patch["license_issue_date"]) if patch["license_issue_date"] else None
    await update_row("drivers", did, user["workspace_id"], patch, DRIVER_COLS)
    return await fetch_one("select * from drivers where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])

@api.delete("/drivers/{did}")
async def delete_driver(did: str, user: dict = Depends(get_current_user)):
    await execute("delete from drivers where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])
    return {"ok": True}

@api.get("/drivers/{did}/history")
async def driver_history(did: str, user: dict = Depends(get_current_user)):
    d = await fetch_one("select * from drivers where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])
    if not d: raise HTTPException(status_code=404, detail="Not found")
    if not d.get("assigned_vehicle_id"):
        return {"driver": d, "vehicle": None, "inspections": [], "maintenance": [], "total_cost": 0}
    vehicle = await fetch_one("select * from vehicles where id = :id and workspace_id = :ws", id=d["assigned_vehicle_id"], ws=user["workspace_id"])
    inspections = await fetch_all(
        "select * from inspections where workspace_id = :ws and vehicle_id = :vid order by created_at desc limit 200",
        ws=user["workspace_id"], vid=d["assigned_vehicle_id"],
    )
    maint = await fetch_all(
        "select * from maintenance where workspace_id = :ws and vehicle_id = :vid order by created_at desc limit 200",
        ws=user["workspace_id"], vid=d["assigned_vehicle_id"],
    )
    total = sum(m.get("actual_cost", 0) or 0 for m in maint if m.get("status") == "completed")
    return {"driver": d, "vehicle": vehicle, "inspections": inspections, "maintenance": maint, "total_cost": round(total, 2)}

def _d10(v) -> str:
    """Format a datetime (or None) as YYYY-MM-DD, matching the old ISO-string[:10] slicing."""
    return v.strftime("%Y-%m-%d") if v else ""

def _group_key(vid, vmap, gmap):
    """Resolve a vehicle_id to (key, label) for either 'vehicle' or 'group' breakdown."""
    v = vmap.get(vid) or {}
    gid = v.get("group_id")
    g = gmap.get(gid)
    return (gid or "none", g["name"] if g else "No group")

def _aggregate(items, vmap, gmap, group_by, value_fn, count_only=False, dmap=None):
    """Collapse a list of rows into per-vehicle, per-group, or per-driver totals."""
    buckets = {}
    for it in items:
        if group_by == "driver":
            did = it.get("driver_id")
            d = (dmap or {}).get(did)
            key, label, plate = did or "none", d["name"] if d else "Unassigned", ""
        elif group_by == "group":
            key, label = _group_key(it.get("vehicle_id"), vmap, gmap)
            plate = ""
        else:
            vid = it.get("vehicle_id")
            v = vmap.get(vid) or {}
            key, label, plate = vid or "none", v.get("name", "?"), v.get("plate", "")
        b = buckets.setdefault(key, {"vehicle": label, "plate": plate, "value": 0, "jobs": 0})
        b["value"] += 0 if count_only else (value_fn(it) or 0)
        b["jobs"] += 1
    return list(buckets.values())

def _period_bounds(period):
    """Maps a 'period' query param to (cutoff, prior_cutoff) datetimes — cutoff marks the start of
    the current window, prior_cutoff the start of the immediately preceding equal-length window
    (used for delta_pct). Returns (None, None) for 'all'/unset, meaning no filtering."""
    if not period or period == "all":
        return None, None
    days = {"7d": 7, "30d": 30, "90d": 90, "6m": 182, "12m": 365}.get(period)
    if not days:
        return None, None
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    return cutoff, cutoff - timedelta(days=days)

def _in_range(dt, start, end=None):
    if dt is None: return False
    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
    if start and dt < start: return False
    if end is not None and dt >= end: return False
    return True

def _with_delta(rows, prior_items, vmap, gmap, group_by, value_fn, dmap=None):
    """Mutates rows in place, adding delta_pct = % change vs. the same bucket's prior-period value."""
    prior_rows = _aggregate(prior_items, vmap, gmap, group_by, value_fn, dmap=dmap)
    prior_map = {(r["vehicle"], r["plate"]): r["value"] for r in prior_rows}
    for r in rows:
        prev = prior_map.get((r["vehicle"], r["plate"]))
        r["delta_pct"] = round((r["value"] - prev) / prev * 100, 1) if prev else None
    return rows

# --- Investigation panel ---
@api.get("/investigate/{kpi_key}")
async def investigate(kpi_key: str, group_by: Optional[str] = None, period: Optional[str] = None, user: dict = Depends(get_current_user)):
    vehicles = await fetch_all("select * from vehicles where workspace_id = :ws", ws=user["workspace_id"])
    maint_all = await fetch_all("select * from maintenance where workspace_id = :ws", ws=user["workspace_id"])
    fuel_logs_all = await fetch_all("select * from fuel_logs where workspace_id = :ws", ws=user["workspace_id"])
    groups = await fetch_all("select * from vehicle_groups where workspace_id = :ws", ws=user["workspace_id"]) if group_by == "group" else []
    drivers = await fetch_all("select * from drivers where workspace_id = :ws", ws=user["workspace_id"]) if group_by == "driver" else []
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    vehicles = vehicles if allowed_vehicles is None else [v for v in vehicles if str(v["id"]) in allowed_vehicles]
    maint_all = _scope_filter(maint_all, allowed_vehicles, allowed_assets)
    fuel_logs_all = _scope_filter(fuel_logs_all, allowed_vehicles, None)
    vmap = {v["id"]: v for v in vehicles}
    gmap = {g["id"]: g for g in groups}
    dmap = {d["id"]: d for d in drivers}
    def vname(vid): return vmap.get(vid, {}).get("name", "?")
    def vplate(vid): return vmap.get(vid, {}).get("plate", "")

    cutoff, prior_cutoff = _period_bounds(period)
    def m_date(m): return m.get("completed_at") or m.get("created_at")
    if cutoff:
        maint = [m for m in maint_all if _in_range(m_date(m), cutoff)]
        maint_prior = [m for m in maint_all if _in_range(m_date(m), prior_cutoff, cutoff)]
        fuel_logs = [f for f in fuel_logs_all if _in_range(f.get("occurred_at"), cutoff)]
        fuel_logs_prior = [f for f in fuel_logs_all if _in_range(f.get("occurred_at"), prior_cutoff, cutoff)]
    else:
        maint, maint_prior, fuel_logs, fuel_logs_prior = maint_all, [], fuel_logs_all, []

    completed = [m for m in maint if m.get("status") == "completed"]
    completed_prior = [m for m in maint_prior if m.get("status") == "completed"]

    def downtime_cost_fn(m):
        return (m.get("downtime_hours", 0) or 0) * (vmap.get(m.get("vehicle_id"), {}).get("downtime_cost_per_hour", 0) or 0)

    def fleet_cost_fn(m):
        return (m.get("actual_cost", 0) or 0) + downtime_cost_fn(m)

    if kpi_key == "total_maintenance_cost":
        if group_by in ("vehicle", "group"):
            rows = _aggregate(completed, vmap, gmap, group_by, lambda m: m.get("actual_cost", 0))
            for r in rows: r["value"] = round(r["value"], 2)
            if cutoff: _with_delta(rows, completed_prior, vmap, gmap, group_by, lambda m: m.get("actual_cost", 0))
            rows.sort(key=lambda x: x["value"], reverse=True)
            cols = (["vehicle", "value", "jobs"] if group_by == "group" else ["vehicle", "plate", "value", "jobs"]) + (["delta_pct"] if cutoff else [])
            return {"title": f"Total maintenance cost · by {group_by}", "total": round(sum(r["value"] for r in rows), 2), "unit": "$", "columns": cols, "rows": rows}
        rows = [{
            "vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
            "title": m["title"], "cost": round(m.get("actual_cost", 0) or 0, 2),
            "priority": m.get("priority", ""), "date": _d10(m.get("completed_at") or m.get("created_at")),
        } for m in completed]
        rows.sort(key=lambda x: x["cost"], reverse=True)
        total = sum(r["cost"] for r in rows)
        return {"title": "Total maintenance cost", "total": total, "unit": "$", "columns": ["vehicle","plate","title","cost","priority","date"], "rows": rows[:200]}
    if kpi_key == "total_fleet_cost":
        if group_by in ("vehicle", "group"):
            rows = _aggregate(completed, vmap, gmap, group_by, fleet_cost_fn)
            for r in rows: r["value"] = round(r["value"], 2)
            if cutoff: _with_delta(rows, completed_prior, vmap, gmap, group_by, fleet_cost_fn)
            rows.sort(key=lambda x: x["value"], reverse=True)
            cols = (["vehicle", "value", "jobs"] if group_by == "group" else ["vehicle", "plate", "value", "jobs"]) + (["delta_pct"] if cutoff else [])
            fuel_total = sum(f.get("cost", 0) or 0 for f in fuel_logs)
            return {"title": f"Total fleet cost · by {group_by}", "total": round(sum(r["value"] for r in rows) + fuel_total, 2), "unit": "$", "columns": cols, "rows": rows}
        maint_cost = sum(m.get("actual_cost", 0) or 0 for m in completed)
        downtime_cost = sum(downtime_cost_fn(m) for m in completed)
        fuel_cost = sum(f.get("cost", 0) or 0 for f in fuel_logs)
        rows = [
            {"component": "Maintenance", "cost": round(maint_cost, 2)},
            {"component": "Fuel", "cost": round(fuel_cost, 2)},
            {"component": "Downtime", "cost": round(downtime_cost, 2)},
        ]
        return {"title": "Total fleet cost", "total": round(maint_cost + downtime_cost + fuel_cost, 2), "unit": "$", "columns": ["component","cost"], "rows": rows}
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
        if group_by in ("vehicle", "group"):
            rows = _aggregate(pend, vmap, gmap, group_by, lambda m: m.get("estimated_cost", 0))
            for r in rows: r["value"] = round(r["value"], 2)
            rows.sort(key=lambda x: x["jobs"], reverse=True)
            cols = ["vehicle", "jobs", "value"] if group_by == "group" else ["vehicle", "plate", "jobs", "value"]
            return {"title": f"Pending jobs · by {group_by}", "total": len(pend), "unit": "jobs", "columns": cols, "rows": rows}
        rows = [{"vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
                 "title": m["title"], "status": m["status"], "priority": m.get("priority", ""),
                 "estimated_cost": round(m.get("estimated_cost", 0) or 0, 2),
                 "created": _d10(m.get("created_at"))} for m in pend]
        return {"title": "Pending jobs", "total": len(rows), "unit": "jobs", "columns": ["vehicle","plate","title","status","priority","estimated_cost","created"], "rows": rows}
    if kpi_key == "completed_jobs":
        if group_by in ("vehicle", "group"):
            rows = _aggregate(completed, vmap, gmap, group_by, lambda m: m.get("actual_cost", 0))
            for r in rows: r["value"] = round(r["value"], 2)
            rows.sort(key=lambda x: x["jobs"], reverse=True)
            cols = ["vehicle", "jobs", "value"] if group_by == "group" else ["vehicle", "plate", "jobs", "value"]
            return {"title": f"Completed jobs · by {group_by}", "total": len(completed), "unit": "jobs", "columns": cols, "rows": rows}
        rows = [{"vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
                 "title": m["title"], "cost": round(m.get("actual_cost", 0) or 0, 2),
                 "downtime": m.get("downtime_hours", 0), "completed": _d10(m.get("completed_at"))} for m in completed]
        rows.sort(key=lambda x: x["completed"] or "", reverse=True)
        return {"title": "Completed jobs", "total": len(rows), "unit": "jobs", "columns": ["vehicle","plate","title","cost","downtime","completed"], "rows": rows}
    if kpi_key == "total_vehicles":
        if group_by == "group":
            rows = []
            for gid, g in gmap.items():
                n = sum(1 for v in vehicles if v.get("group_id") == gid)
                rows.append({"vehicle": g["name"], "value": n})
            n_none = sum(1 for v in vehicles if not v.get("group_id"))
            if n_none: rows.append({"vehicle": "No group", "value": n_none})
            rows.sort(key=lambda x: x["value"], reverse=True)
            return {"title": "Fleet vehicles · by group", "total": len(vehicles), "unit": "vehicles", "columns": ["vehicle", "value"], "rows": rows}
        rows = [{"name": v["name"], "plate": v["plate"], "make": v.get("make", ""), "model": v.get("model", ""), "status": v.get("status", ""), "odometer": v.get("odometer", 0)} for v in vehicles]
        return {"title": "Fleet vehicles", "total": len(rows), "unit": "vehicles", "columns": ["name","plate","make","model","status","odometer"], "rows": rows}
    if kpi_key == "downtime":
        completed_dt = [m for m in completed if (m.get("downtime_hours") or 0) > 0]
        if group_by in ("vehicle", "group"):
            rows = _aggregate(completed_dt, vmap, gmap, group_by, lambda m: m.get("downtime_hours", 0))
            for r in rows: r["value"] = round(r["value"], 1)
            rows.sort(key=lambda x: x["value"], reverse=True)
            cols = ["vehicle", "value", "jobs"] if group_by == "group" else ["vehicle", "plate", "value", "jobs"]
            return {"title": f"Downtime hours · by {group_by}", "total": round(sum(r["value"] for r in rows), 1), "unit": "h", "columns": cols, "rows": rows}
        rows = [{"vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
                 "title": m["title"], "downtime_hours": m.get("downtime_hours", 0),
                 "completed": _d10(m.get("completed_at"))} for m in completed_dt]
        rows.sort(key=lambda x: x["downtime_hours"], reverse=True)
        total = sum(r["downtime_hours"] for r in rows)
        return {"title": "Downtime hours", "total": total, "unit": "h", "columns": ["vehicle","plate","title","downtime_hours","completed"], "rows": rows}
    if kpi_key == "downtime_cost":
        completed_dt = [m for m in completed if (m.get("downtime_hours") or 0) > 0]
        if group_by in ("vehicle", "group"):
            rows = _aggregate(completed_dt, vmap, gmap, group_by, downtime_cost_fn)
            for r in rows: r["value"] = round(r["value"], 2)
            if cutoff: _with_delta(rows, [m for m in completed_prior if (m.get("downtime_hours") or 0) > 0], vmap, gmap, group_by, downtime_cost_fn)
            rows.sort(key=lambda x: x["value"], reverse=True)
            cols = (["vehicle", "value", "jobs"] if group_by == "group" else ["vehicle", "plate", "value", "jobs"]) + (["delta_pct"] if cutoff else [])
            return {"title": f"Downtime cost · by {group_by}", "total": round(sum(r["value"] for r in rows), 2), "unit": "$", "columns": cols, "rows": rows}
        rows = [{"vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
                 "title": m["title"], "downtime_hours": m.get("downtime_hours", 0),
                 "downtime_cost": round(downtime_cost_fn(m), 2), "completed": _d10(m.get("completed_at"))} for m in completed_dt]
        rows.sort(key=lambda x: x["downtime_cost"], reverse=True)
        total = sum(r["downtime_cost"] for r in rows)
        return {"title": "Downtime cost", "total": round(total, 2), "unit": "$", "columns": ["vehicle","plate","title","downtime_hours","downtime_cost","completed"], "rows": rows}
    if kpi_key == "fuel_cost":
        if group_by in ("vehicle", "group"):
            rows = _aggregate(fuel_logs, vmap, gmap, group_by, lambda f: f.get("cost", 0))
            for r in rows: r["value"] = round(r["value"], 2)
            if cutoff: _with_delta(rows, fuel_logs_prior, vmap, gmap, group_by, lambda f: f.get("cost", 0))
            rows.sort(key=lambda x: x["value"], reverse=True)
            cols = ["vehicle", "value", "jobs"] if group_by == "group" else ["vehicle", "plate", "value", "jobs"]
            title_cols = [c if c != "jobs" else "transactions" for c in cols] + (["delta_pct"] if cutoff else [])
            for r in rows: r["transactions"] = r.pop("jobs")
            return {"title": f"Fuel cost · by {group_by}", "total": round(sum(r["value"] for r in rows), 2), "unit": "$", "columns": title_cols, "rows": rows}
        rows = [{"vehicle": vname(f["vehicle_id"]), "plate": vplate(f["vehicle_id"]),
                 "litres": f.get("litres", 0), "cost": round(f.get("cost", 0) or 0, 2),
                 "location": f.get("location", ""), "date": _d10(f.get("occurred_at"))} for f in fuel_logs]
        rows.sort(key=lambda x: x["date"] or "", reverse=True)
        total = sum(r["cost"] for r in rows)
        return {"title": "Fuel cost (transactions)", "total": round(total, 2), "unit": "$", "columns": ["vehicle","plate","litres","cost","location","date"], "rows": rows[:200]}
    if kpi_key == "utilization":
        rows = [{"vehicle": v["name"], "plate": v["plate"], "status": v.get("status", ""), "odometer": v.get("odometer", 0)} for v in vehicles]
        active = sum(1 for v in vehicles if v.get("status") == "active")
        return {"title": "Fleet utilization", "total": round(active / len(vehicles) * 100 if vehicles else 0, 1), "unit": "%", "columns": ["vehicle","plate","status","odometer"], "rows": rows}
    if kpi_key == "tyre_cost":
        tyre_jobs = [m for m in completed if m.get("category") == "tyres"]
        if group_by in ("vehicle", "group"):
            rows = _aggregate(tyre_jobs, vmap, gmap, group_by, lambda m: m.get("actual_cost", 0))
            for r in rows: r["value"] = round(r["value"], 2)
            if cutoff: _with_delta(rows, [m for m in completed_prior if m.get("category") == "tyres"], vmap, gmap, group_by, lambda m: m.get("actual_cost", 0))
            rows.sort(key=lambda x: x["value"], reverse=True)
            cols = (["vehicle", "value", "jobs"] if group_by == "group" else ["vehicle", "plate", "value", "jobs"]) + (["delta_pct"] if cutoff else [])
            return {"title": f"Tyre cost · by {group_by}", "total": round(sum(r["value"] for r in rows), 2), "unit": "$", "columns": cols, "rows": rows}
        rows = [{"vehicle": vname(m["vehicle_id"]), "plate": vplate(m["vehicle_id"]),
                 "title": m["title"], "cost": round(m.get("actual_cost", 0) or 0, 2),
                 "date": _d10(m.get("completed_at") or m.get("created_at"))} for m in tyre_jobs]
        rows.sort(key=lambda x: x["cost"], reverse=True)
        return {"title": "Tyre cost", "total": round(sum(r["cost"] for r in rows), 2), "unit": "$", "columns": ["vehicle","plate","title","cost","date"], "rows": rows}
    if kpi_key == "driver_performance":
        scores = await _compute_driver_performance(user["workspace_id"])
        rows = [{"vehicle": s["name"], "score": s["score"], "status": s["status"]} for s in scores]
        avg = round(sum(r["score"] for r in rows) / len(rows), 1) if rows else 0
        return {"title": "Driver performance", "total": avg, "unit": "score", "columns": ["vehicle", "score", "status"], "rows": rows}
    if kpi_key == "defect_reporting":
        inspections = await fetch_all("select vehicle_id, asset_id, answers from inspections where workspace_id = :ws", ws=user["workspace_id"])
        inspections = _scope_filter(inspections, allowed_vehicles, allowed_assets)
        defect_items = []
        for i in inspections:
            for a in (i.get("answers") or []):
                if a.get("value") == "fail":
                    defect_items.append({"vehicle_id": i.get("vehicle_id")})
        if group_by in ("vehicle", "group"):
            rows = _aggregate(defect_items, vmap, gmap, group_by, lambda x: 0, count_only=True)
            rows.sort(key=lambda x: x["jobs"], reverse=True)
            for r in rows: r["value"] = r["jobs"]
            cols = ["vehicle", "value"] if group_by == "group" else ["vehicle", "plate", "value"]
            return {"title": f"Defect reports · by {group_by}", "total": len(defect_items), "unit": "defects", "columns": cols, "rows": rows}
        rows = [{"vehicle": vname(x["vehicle_id"]), "plate": vplate(x["vehicle_id"])} for x in defect_items]
        return {"title": "Defect reports", "total": len(rows), "unit": "defects", "columns": ["vehicle", "plate"], "rows": rows}
    raise HTTPException(status_code=404, detail="Unknown KPI key")

# --- Insurance / Public share link ---
@api.post("/vehicles/{vid}/share")
async def create_share_link(vid: str, user: dict = Depends(get_current_user)):
    v = await fetch_one("select * from vehicles where id = :id and workspace_id = :ws", id=vid, ws=user["workspace_id"])
    if not v: raise HTTPException(status_code=404, detail="Not found")
    if not v.get("share_token"):
        token = secrets.token_urlsafe(24)
        await execute(
            "update vehicles set share_token = :token, share_created_at = now() where id = :id and workspace_id = :ws",
            token=token, id=vid, ws=user["workspace_id"],
        )
    else:
        token = v["share_token"]
    await log_event(user, "vehicle.shared", "vehicle", vid, {"plate": v.get("plate")})
    return {"token": token, "url": f"/public/vehicle/{token}"}

@api.delete("/vehicles/{vid}/share")
async def revoke_share_link(vid: str, user: dict = Depends(get_current_user)):
    await execute(
        "update vehicles set share_token = null, share_created_at = null where id = :id and workspace_id = :ws",
        id=vid, ws=user["workspace_id"],
    )
    return {"ok": True}

@api.get("/public/vehicle/{token}")
async def public_vehicle(token: str):
    v = await fetch_one("select * from vehicles where share_token = :token", token=token)
    if not v: raise HTTPException(status_code=404, detail="Not found or link revoked")
    workspace_id = v.pop("workspace_id")
    v.pop("share_token", None)
    workspace = await fetch_one("select name, currency from workspaces where id = :id", id=workspace_id) or {"name": "Fleet", "currency": "USD"}
    # inspections + safety-relevant maintenance history
    inspections = await fetch_all(
        "select * from inspections where vehicle_id = :vid order by created_at desc limit 50", vid=v["id"],
    )
    for insp in inspections:
        insp.pop("workspace_id", None); insp.pop("inspector_id", None)
        insp["answers"] = [{k: vv for k, vv in a.items() if k != "photo"} for a in insp.get("answers", [])]
    maint = await fetch_all(
        "select * from maintenance where vehicle_id = :vid and status = 'completed' order by completed_at desc limit 100",
        vid=v["id"],
    )
    for m in maint:
        m.pop("workspace_id", None)
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
    ws_row = await fetch_one("select license_warning_days from workspaces where id = :id", id=user["workspace_id"])
    license_warning_days = (ws_row or {}).get("license_warning_days") or 30
    parts = await fetch_all("select * from parts where workspace_id = :ws", ws=user["workspace_id"])
    low_stock = [p for p in parts if (p.get("stock", 0) or 0) <= (p.get("reorder_point", 0) or 0)]
    drivers = await fetch_all("select * from drivers where workspace_id = :ws", ws=user["workspace_id"])
    expiring = []
    for d in drivers:
        try:
            days = (d["license_expiry"] - datetime.now(timezone.utc).date()).days
            if days <= license_warning_days:
                expiring.append({"driver_id": d["id"], "name": d["name"], "days": days, "expiry": str(d["license_expiry"])})
        except Exception: pass
    maint = await fetch_all("select * from maintenance where workspace_id = :ws", ws=user["workspace_id"])
    pending = [m for m in maint if m.get("status") in ("pending", "in_progress")]
    critical = [m for m in maint if m.get("priority") == "critical" and m.get("status") != "completed"]
    incidents = await fetch_all(
        "select * from incidents where workspace_id = :ws order by occurred_at desc limit 200", ws=user["workspace_id"],
    )
    open_incidents = [i for i in incidents if i.get("severity") in ("moderate", "severe")]
    # anomalies (reuse quick logic)
    completed = [m for m in maint if m.get("status") == "completed"]
    by_v = {}
    for m in completed:
        d = m.get("completed_at") or m.get("created_at")
        mo = d.strftime("%Y-%m") if d else ""
        if not mo: continue
        by_v.setdefault(m["vehicle_id"], {}).setdefault(mo, 0)
        by_v[m["vehicle_id"]][mo] += float(m.get("actual_cost", 0) or 0)
    anomaly_vehicles = []
    for vid, months in by_v.items():
        if len(months) < 3: continue
        vals = [v for _, v in sorted(months.items())]
        latest = vals[-1]; hist = vals[:-1]
        mean = sum(hist) / len(hist)
        std = (sum((x - mean) ** 2 for x in hist) / len(hist)) ** 0.5
        if std > 0 and latest > mean + 1.5 * std: anomaly_vehicles.append({"vehicle_id": vid, "latest": latest, "mean": mean})
    anomalies = len(anomaly_vehicles)
    overdue_checklists = await _compute_overdue_checklists(user["workspace_id"])
    recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    recent_insp = await fetch_all(
        "select id, vehicle_id, inspector_name, fail_count, created_at from inspections "
        "where workspace_id = :ws and fail_count > 0 and created_at >= :cutoff order by created_at desc",
        ws=user["workspace_id"], cutoff=recent_cutoff,
    )
    role = user.get("role")
    actionable_stage = "pending_ops" if role in OPS_ROLES else "pending_finance" if role in FINANCE_ROLES else None
    pending_approvals = []
    if actionable_stage:
        pending_approvals = await fetch_all(
            "select id from quotes where workspace_id = :ws and stage = :stage", ws=user["workspace_id"], stage=actionable_stage,
        )
    open_defect_reports_rows = await fetch_all(
        "select * from defects where workspace_id = :ws and status != 'resolved' order by created_at desc limit 10",
        ws=user["workspace_id"],
    )
    budget_rows = await _budget_summary(user["workspace_id"], datetime.now(timezone.utc).year)
    budget_overruns = [r for r in budget_rows if r["status"] == "over_budget"]
    approval_jobs = []
    if pending_approvals:
        approval_jobs = await fetch_all(
            "select * from quotes where workspace_id = :ws and stage = :stage order by submitted_at limit 10",
            ws=user["workspace_id"], stage=actionable_stage,
        )

    critical_count = len(critical) + len(open_incidents) + sum(1 for e in expiring if e["days"] < 0)
    warning_count = (anomalies + len(low_stock) + sum(1 for e in expiring if 0 <= e["days"] <= 30) + len(overdue_checklists)
                      + len(recent_insp) + len(pending_approvals) + len(open_defect_reports_rows) + len(budget_overruns))

    # Enrich vehicle-scoped items with a display name — every popover row below leans on this.
    v_ids = list({x.get("vehicle_id") for x in critical + open_incidents + open_defect_reports_rows + pending + recent_insp
                  if x.get("vehicle_id")} | {a["vehicle_id"] for a in anomaly_vehicles})
    vmap = {v["id"]: v for v in await fetch_all(
        "select id, name, plate from vehicles where workspace_id = :ws and id = any(:ids)", ws=user["workspace_id"], ids=v_ids,
    )} if v_ids else {}
    def vlabel(vid):
        v = vmap.get(vid)
        return f"{v['name']} · {v['plate']}" if v else "Unassigned"

    money = lambda n: f"${float(n or 0):,.2f}"

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
            "overdue_checklists": len(overdue_checklists),
            "recent_defects": len(recent_insp),
            "approvals": len(pending_approvals),
            "open_defect_reports": len(open_defect_reports_rows),
            "budget_overruns": len(budget_overruns),
        },
        "details": {
            "expiring_drivers": expiring[:10],
            "critical_jobs": [{"id": m["id"], "title": m["title"], "vehicle_id": m["vehicle_id"]} for m in critical[:10]],
            "open_incidents": [{"id": i["id"], "description": i["description"][:60], "severity": i["severity"], "vehicle_id": i["vehicle_id"]} for i in open_incidents[:10]],
            "maintenance_critical": [
                {"title": m["title"], "subtitle": vlabel(m.get("vehicle_id")), "right": (m.get("priority") or "").title(), "tone": "critical"}
                for m in critical[:5]
            ],
            "open_incidents_popover": [
                {"title": f"{(i.get('kind') or '').title()} · {i.get('severity')}", "subtitle": vlabel(i.get("vehicle_id")),
                 "right": (i.get("severity") or "").title(), "tone": "critical" if i.get("severity") == "severe" else "warning"}
                for i in open_incidents[:5]
            ],
            "overdue_checklists": [
                {"title": f"{oc['target_name']} — {oc['template_name']}",
                 "subtitle": "Never inspected" if oc.get("last_completed_at") is None else f"{oc.get('days_overdue', 0)}d overdue",
                 "right": "Missed" if oc.get("last_completed_at") is None else "Overdue",
                 "tone": "critical" if oc.get("last_completed_at") is None else "warning"}
                for oc in overdue_checklists[:5]
            ],
            "low_stock_parts": [
                {"title": f"{p['name']} — {p.get('stock', 0)} unit(s)", "subtitle": f"Min stock: {p.get('reorder_point', 0)} · {p.get('supplier') or '—'}",
                 "right": "Out of stock" if not p.get("stock") else "Reorder now", "tone": "critical" if not p.get("stock") else "warning"}
                for p in low_stock[:5]
            ],
            "approvals": [
                {"title": f"Quote — {money(q.get('total'))}", "subtitle": q.get("submitted_by_name") or "—",
                 "right": "Waiting", "tone": "warning"}
                for q in approval_jobs[:5]
            ],
            "open_defect_reports": [
                {"title": f"{vlabel(d.get('vehicle_id'))} — {(d.get('category') or '').title()}",
                 "subtitle": f"{(d.get('severity') or '').title()}" + (f" · {d['location']}" if d.get("location") else ""),
                 "right": (d.get("severity") or "").title(), "tone": "critical" if d.get("severity") == "critical" else "warning"}
                for d in open_defect_reports_rows[:5]
            ],
            "pending_jobs": [
                {"title": m["title"], "subtitle": f"{vlabel(m.get('vehicle_id'))} · {m.get('category') or 'general'}",
                 "right": (m.get("status") or "").replace("_", " ").title(), "tone": "info"}
                for m in pending[:5]
            ],
            "recent_defects": [
                {"title": f"{vlabel(i.get('vehicle_id'))} — {i.get('fail_count', 0)} failed item(s)",
                 "subtitle": f"Inspected by {i.get('inspector_name') or '—'}", "right": "New", "tone": "warning"}
                for i in recent_insp[:5]
            ],
            "cost_anomalies": [
                {"title": vlabel(a["vehicle_id"]), "subtitle": f"{money(a['latest'])} vs {money(a['mean'])} avg",
                 "right": "Spike", "tone": "warning"}
                for a in anomaly_vehicles[:5]
            ],
            "budget_overruns": [
                {"title": f"{r['category'].title()} — {money(r['actual'])}", "subtitle": f"{money(r['variance'])} over budget",
                 "right": "Over Budget", "tone": "critical"}
                for r in budget_overruns[:5]
            ],
            "license_expiring": [
                {"title": e["name"], "subtitle": f"Expires {e['expiry']}",
                 "right": "Expired" if e["days"] < 0 else f"{e['days']}d", "tone": "critical" if e["days"] < 0 else "warning"}
                for e in expiring[:5]
            ],
        }
    }

def _item_label(template, item_id):
    if not template: return item_id
    for section in template.get("sections") or []:
        for item in section.get("items") or []:
            if item.get("id") == item_id:
                return item.get("label", item_id)
    return item_id

async def _vehicle_events(vid: str, ws: str):
    """Shared by the timeline and the investigation endpoint — one merged, typed event feed per
    vehicle: inspections, defects (failed inspection items, split out from the generic inspection
    event), maintenance jobs, fuel transactions, and incidents."""
    events = []
    inspections = await fetch_all("select * from inspections where workspace_id = :ws and vehicle_id = :vid", ws=ws, vid=vid)
    template_ids = list({i["template_id"] for i in inspections if i.get("template_id")})
    tmap = {t["id"]: t for t in await fetch_all(
        "select * from templates where workspace_id = :ws and id = any(:ids)", ws=ws, ids=template_ids,
    )} if template_ids else {}
    for i in inspections:
        events.append({"type": "inspection", "at": i.get("created_at"), "title": f"Inspection · {i.get('fail_count', 0)} failed", "by": i.get("inspector_name"), "meta": {"id": i["id"], "fail_count": i.get("fail_count", 0)}})
        template = tmap.get(i.get("template_id"))
        for a in (i.get("answers") or []):
            if a.get("value") == "fail":
                events.append({"type": "defect", "at": i.get("created_at"), "title": _item_label(template, a.get("item_id")), "by": i.get("inspector_name"), "meta": {"id": i["id"], "item_id": a.get("item_id"), "note": a.get("note", "")}})
    for m in await fetch_all("select * from maintenance where workspace_id = :ws and vehicle_id = :vid", ws=ws, vid=vid):
        events.append({"type": "maintenance", "at": m.get("created_at"), "title": m.get("title", ""), "by": None, "meta": {"id": m["id"], "status": m.get("status"), "cost": m.get("actual_cost") or m.get("estimated_cost") or 0, "priority": m.get("priority")}})
    for f in await fetch_all("select * from fuel_logs where workspace_id = :ws and vehicle_id = :vid", ws=ws, vid=vid):
        events.append({"type": "fuel", "at": f.get("occurred_at"), "title": f"Fuel · {f.get('litres', 0)}L", "by": None, "meta": {"id": f["id"], "cost": f.get("cost", 0), "location": f.get("location", "")}})
    for inc in await fetch_all("select * from incidents where workspace_id = :ws and vehicle_id = :vid", ws=ws, vid=vid):
        events.append({"type": "incident", "at": inc.get("occurred_at"), "title": f"{inc.get('kind', '').title()} · {inc.get('severity')}", "by": None, "meta": {"id": inc["id"], "description": inc.get("description", "")[:120], "severity": inc.get("severity")}})
    epoch = datetime.min.replace(tzinfo=timezone.utc)
    events.sort(key=lambda e: e["at"] or epoch, reverse=True)
    return events

@api.get("/vehicles/{vid}/timeline")
async def vehicle_timeline(vid: str, user: dict = Depends(get_current_user)):
    return await _vehicle_events(vid, user["workspace_id"])

@api.get("/vehicles/{vid}/investigation")
async def vehicle_investigation(vid: str, period: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Level 3 aggregation for the drill-down investigation panel: profile, driver, cost summary
    (with period-over-period delta), monthly trend, fuel/maintenance lists, defect history, a
    utilization proxy, and the combined event timeline — everything one vehicle-deep-dive needs."""
    ws = user["workspace_id"]
    v = await fetch_one("select * from vehicles where id = :id and workspace_id = :ws", id=vid, ws=ws)
    if not v: raise HTTPException(status_code=404, detail="Vehicle not found")
    drivers = await fetch_all("select * from drivers where workspace_id = :ws and assigned_vehicle_id = :vid limit 1", ws=ws, vid=vid)
    driver = drivers[0] if drivers else None

    maint = await fetch_all("select * from maintenance where workspace_id = :ws and vehicle_id = :vid", ws=ws, vid=vid)
    fuel_logs = await fetch_all("select * from fuel_logs where workspace_id = :ws and vehicle_id = :vid order by occurred_at desc", ws=ws, vid=vid)

    cutoff, prior_cutoff = _period_bounds(period)
    def m_date(m): return m.get("completed_at") or m.get("created_at")
    if cutoff:
        maint_cur = [m for m in maint if _in_range(m_date(m), cutoff)]
        maint_prior = [m for m in maint if _in_range(m_date(m), prior_cutoff, cutoff)]
        fuel_cur = [f for f in fuel_logs if _in_range(f.get("occurred_at"), cutoff)]
        fuel_prior = [f for f in fuel_logs if _in_range(f.get("occurred_at"), prior_cutoff, cutoff)]
    else:
        maint_cur, maint_prior, fuel_cur, fuel_prior = maint, [], fuel_logs, []

    completed_cur = [m for m in maint_cur if m.get("status") == "completed"]
    completed_prior = [m for m in maint_prior if m.get("status") == "completed"]
    dt_rate = v.get("downtime_cost_per_hour", 0) or 0

    def summary_for(completed, fuel):
        maint_cost = sum(m.get("actual_cost", 0) or 0 for m in completed)
        downtime_hours = sum(m.get("downtime_hours", 0) or 0 for m in completed)
        downtime_cost = downtime_hours * dt_rate
        fuel_cost = sum(f.get("cost", 0) or 0 for f in fuel)
        return {
            "maintenance_cost": round(maint_cost, 2), "downtime_hours": round(downtime_hours, 1),
            "downtime_cost": round(downtime_cost, 2), "fuel_cost": round(fuel_cost, 2),
            "total_cost": round(maint_cost + downtime_cost + fuel_cost, 2),
        }

    cur_summary = summary_for(completed_cur, fuel_cur)
    if cutoff:
        prior_summary = summary_for(completed_prior, fuel_prior)
        for k in ("maintenance_cost", "downtime_cost", "fuel_cost", "total_cost"):
            prev = prior_summary[k]
            cur_summary[f"{k}_delta_pct"] = round((cur_summary[k] - prev) / prev * 100, 1) if prev else None

    # monthly trend, scoped to this vehicle (mirrors /analytics/cost-trend)
    buckets = {}
    for m in maint:
        if m.get("status") != "completed": continue
        d = m.get("completed_at") or m.get("created_at") or datetime.now(timezone.utc)
        month = d.strftime("%Y-%m")
        buckets.setdefault(month, {"month": month, "parts": 0, "labor": 0, "fuel": 0, "total": 0})
        buckets[month]["parts"] += m.get("parts_cost", 0) or 0
        buckets[month]["labor"] += m.get("labor_cost", 0) or 0
        buckets[month]["total"] += m.get("actual_cost", 0) or 0
    for f in fuel_logs:
        d = f.get("occurred_at") or datetime.now(timezone.utc)
        month = d.strftime("%Y-%m")
        buckets.setdefault(month, {"month": month, "parts": 0, "labor": 0, "fuel": 0, "total": 0})
        buckets[month]["fuel"] += f.get("cost", 0) or 0
        buckets[month]["total"] += f.get("cost", 0) or 0
    monthly_trend = sorted(buckets.values(), key=lambda x: x["month"])

    # defect history: failed inspection answer items, newest first
    inspections = await fetch_all("select * from inspections where workspace_id = :ws and vehicle_id = :vid order by created_at desc", ws=ws, vid=vid)
    template_ids = list({i["template_id"] for i in inspections if i.get("template_id")})
    tmap = {t["id"]: t for t in await fetch_all(
        "select * from templates where workspace_id = :ws and id = any(:ids)", ws=ws, ids=template_ids,
    )} if template_ids else {}
    defects = []
    for i in inspections:
        template = tmap.get(i.get("template_id"))
        for a in (i.get("answers") or []):
            if a.get("value") == "fail":
                defects.append({"inspection_id": i["id"], "item_id": a.get("item_id"), "label": _item_label(template, a.get("item_id")), "note": a.get("note", ""), "date": _d10(i.get("created_at"))})

    # utilization proxy: current status + rough avg km/day since the vehicle was added
    age_days = max(1, (datetime.now(timezone.utc) - v["created_at"]).days) if v.get("created_at") else 1
    avg_km_per_day = round((v.get("odometer", 0) or 0) / age_days, 1)

    events = await _vehicle_events(vid, ws)
    epoch = datetime.min.replace(tzinfo=timezone.utc)

    return {
        "vehicle": v,
        "driver": driver,
        "cost_summary": cur_summary,
        "monthly_trend": monthly_trend,
        "fuel_logs": fuel_logs[:100],
        "maintenance": sorted(maint, key=lambda m: m.get("created_at") or epoch, reverse=True)[:100],
        "defects": defects[:100],
        "utilization": {"status": v.get("status"), "avg_km_per_day": avg_km_per_day, "odometer": v.get("odometer", 0)},
        "timeline": events,
    }

INCIDENT_COLS = {"driver_id", "kind", "severity", "occurred_at", "location", "description",
                  "reported_cost", "resolution_notes", "resolved", "updated_at", "resolved_at"}

@api.get("/incidents")
async def list_incidents(vehicle_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if vehicle_id:
        incs = await fetch_all(
            "select * from incidents where workspace_id = :ws and vehicle_id = :vid order by occurred_at desc",
            ws=user["workspace_id"], vid=vehicle_id,
        )
    else:
        incs = await fetch_all(
            "select * from incidents where workspace_id = :ws order by occurred_at desc", ws=user["workspace_id"],
        )
    # enrich with vehicle + driver names for fleet-wide index
    v_ids = list({i["vehicle_id"] for i in incs if i.get("vehicle_id")})
    d_ids = list({i["driver_id"] for i in incs if i.get("driver_id")})
    vmap = {v["id"]: v for v in await fetch_all(
        "select id, name, plate from vehicles where workspace_id = :ws and id = any(:ids)",
        ws=user["workspace_id"], ids=v_ids,
    )} if v_ids else {}
    dmap = {d["id"]: d for d in await fetch_all(
        "select id, name from drivers where workspace_id = :ws and id = any(:ids)",
        ws=user["workspace_id"], ids=d_ids,
    )} if d_ids else {}
    for i in incs:
        v = vmap.get(i.get("vehicle_id") or "", {})
        d = dmap.get(i.get("driver_id") or "", {})
        i["vehicle_name"] = v.get("name")
        i["vehicle_plate"] = v.get("plate")
        i["driver_name"] = d.get("name")
    allowed_vehicles, _ = await _resolve_full_scope(user)
    return _scope_filter(incs, allowed_vehicles, None)

@api.get("/incidents/{iid}")
async def get_incident(iid: str, user: dict = Depends(get_current_user)):
    i = await fetch_one("select * from incidents where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])
    if not i: raise HTTPException(status_code=404, detail="Not found")
    allowed_vehicles, _ = await _resolve_full_scope(user)
    if not _scope_filter([i], allowed_vehicles, None):
        raise HTTPException(status_code=404, detail="Not found")
    v = await fetch_one("select name, plate from vehicles where id = :id", id=i["vehicle_id"]) if i.get("vehicle_id") else None
    d = await fetch_one("select name from drivers where id = :id", id=i["driver_id"]) if i.get("driver_id") else None
    i["vehicle_name"] = v.get("name") if v else None
    i["vehicle_plate"] = v.get("plate") if v else None
    i["driver_name"] = d.get("name") if d else None
    return i

@api.post("/incidents")
async def create_incident(inc: IncidentIn, user: dict = Depends(get_current_user)):
    iid = str(uuid.uuid4())
    fields = inc.model_dump(exclude={"photos"})
    fields["occurred_at"] = _parse_datetime(fields["occurred_at"])
    await execute(
        "insert into incidents (id, workspace_id, vehicle_id, driver_id, kind, severity, occurred_at, "
        "location, description, photos, reported_cost, reporter_id, reporter_name) values "
        "(:id, :ws, :vehicle_id, :driver_id, :kind, :severity, :occurred_at, :location, "
        ":description, :photos ::jsonb, :reported_cost, :reporter_id, :reporter_name)",
        id=iid, ws=user["workspace_id"], reporter_id=user["id"], reporter_name=user["name"],
        **fields, photos=json_dumps(inc.photos),
    )
    doc = await fetch_one("select * from incidents where id = :id", id=iid)
    await log_event(user, "incident.reported", "incident", iid, {"kind": doc["kind"], "severity": doc["severity"]})
    return doc

@api.patch("/incidents/{iid}")
async def update_incident(iid: str, patch: IncidentUpdate, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "occurred_at" in data: data["occurred_at"] = _parse_datetime(data["occurred_at"])
    data["updated_at"] = datetime.now(timezone.utc)
    if data.get("resolved") is True and "resolved_at" not in data:
        data["resolved_at"] = datetime.now(timezone.utc)
    existing = await fetch_one("select id from incidents where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])
    if not existing:
        raise HTTPException(status_code=404, detail="Incident not found")
    await update_row("incidents", iid, user["workspace_id"], data, INCIDENT_COLS)
    await log_event(user, "incident.updated", "incident", iid, {"fields": list(data.keys())})
    return await fetch_one("select * from incidents where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])

@api.delete("/incidents/{iid}")
async def delete_incident(iid: str, user: dict = Depends(get_current_user)):
    await execute("delete from incidents where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])
    return {"ok": True}

@api.post("/incidents/{iid}/share")
async def create_incident_share_link(iid: str, user: dict = Depends(get_current_user)):
    inc = await fetch_one("select * from incidents where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])
    if not inc: raise HTTPException(status_code=404, detail="Not found")
    if not inc.get("share_token"):
        token = secrets.token_urlsafe(24)
        await execute(
            "update incidents set share_token = :token, share_created_at = now() where id = :id and workspace_id = :ws",
            token=token, id=iid, ws=user["workspace_id"],
        )
    else:
        token = inc["share_token"]
    await log_event(user, "incident.shared", "incident", iid, {"description": inc.get("description", "")[:60]})
    return {"token": token, "url": f"/public/incident/{token}"}

@api.delete("/incidents/{iid}/share")
async def revoke_incident_share_link(iid: str, user: dict = Depends(get_current_user)):
    await execute(
        "update incidents set share_token = null, share_created_at = null where id = :id and workspace_id = :ws",
        id=iid, ws=user["workspace_id"],
    )
    return {"ok": True}

@api.get("/public/incident/{token}")
async def public_incident(token: str):
    inc = await fetch_one("select * from incidents where share_token = :token", token=token)
    if not inc: raise HTTPException(status_code=404, detail="Not found or link revoked")
    workspace_id = inc.pop("workspace_id")
    inc.pop("share_token", None)
    workspace = await fetch_one("select name, currency from workspaces where id = :id", id=workspace_id) or {"name": "Fleet", "currency": "USD"}
    v = await fetch_one("select name, plate, make, model from vehicles where id = :id", id=inc["vehicle_id"]) if inc.get("vehicle_id") else None
    d = await fetch_one("select name, license_number from drivers where id = :id", id=inc["driver_id"]) if inc.get("driver_id") else None
    return {"workspace": workspace, "incident": inc, "vehicle": v, "driver": d}

@api.get("/public/incident/{token}/pdf")
async def public_incident_pdf(token: str):
    inc = await fetch_one("select id from incidents where share_token = :token", token=token)
    if not inc: raise HTTPException(status_code=404, detail="Not found or link revoked")
    return await _build_incident_pdf(inc["id"])

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://fleetintel.vercel.app")

@api.post("/incidents/{iid}/email-insurance")
async def email_incident_to_insurance(iid: str, req: EmailInsuranceReq, user: dict = Depends(get_current_user)):
    inc = await fetch_one("select * from incidents where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])
    if not inc: raise HTTPException(status_code=404, detail="Not found")
    if not inc.get("share_token"):
        token = secrets.token_urlsafe(24)
        await execute(
            "update incidents set share_token = :token, share_created_at = now() where id = :id and workspace_id = :ws",
            token=token, id=iid, ws=user["workspace_id"],
        )
    else:
        token = inc["share_token"]
    v = await fetch_one("select name, plate from vehicles where id = :id", id=inc["vehicle_id"]) if inc.get("vehicle_id") else None
    ws = await fetch_one("select name, currency from workspaces where id = :id", id=user["workspace_id"]) or {"name": "Fleet", "currency": "USD"}
    currency_symbol = CURRENCY_SYMBOLS.get(ws.get("currency"), "$")
    link = f"{FRONTEND_URL}/public/incident/{token}"
    vehicle_line = f"{v.get('name','')} ({v.get('plate','')})" if v else "—"
    note_html = f'<p style="margin:0 0 16px 0">{escape(req.note)}</p>' if req.note else ""
    html = (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#0f172a">'
        f'<tr><td style="padding:24px;border-bottom:3px solid #34C759">'
        f'<div style="font-size:12px;letter-spacing:0.2em;color:#64748b;text-transform:uppercase">{escape(ws["name"])}</div>'
        f'<h1 style="margin:8px 0 0 0;font-size:22px">Incident report for insurance review</h1></td></tr>'
        f'<tr><td style="padding:24px">'
        f'{note_html}'
        f'<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0">'
        f'<tr><td style="padding:10px;background:#f8fafc;font-weight:bold;width:35%">Vehicle</td><td style="padding:10px;background:#f8fafc">{escape(vehicle_line)}</td></tr>'
        f'<tr><td style="padding:10px;background:#f8fafc;font-weight:bold">Kind</td><td style="padding:10px;background:#f8fafc">{escape((inc.get("kind") or "").title())}</td></tr>'
        f'<tr><td style="padding:10px;background:#f8fafc;font-weight:bold">Severity</td><td style="padding:10px;background:#f8fafc">{escape((inc.get("severity") or "").title())}</td></tr>'
        f'<tr><td style="padding:10px;background:#f8fafc;font-weight:bold">Reported cost</td><td style="padding:10px;background:#f8fafc">{currency_symbol}{inc.get("reported_cost", 0) or 0:,.2f}</td></tr>'
        f'</table>'
        f'<p style="margin:20px 0"><a href="{escape(link)}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px">View and download incident report</a></p>'
        f'<p style="margin:16px 0 0 0;font-size:12px;color:#888">Sent by {escape(ws["name"])} via FleetCost Intelligence. We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )
    email_id = await send_email(to=req.to_email, subject=f"Incident report — {vehicle_line}", html=html)
    await log_event(user, "incident.emailed_insurance", "incident", iid, {"to": req.to_email})
    return {"ok": True, "email_id": email_id, "url": f"/public/incident/{token}"}

# --- Defect reports (driver/technician-reported issues, triaged separately from safety Incidents) ---
DEFECT_COLS = {"category", "severity", "description", "location", "assigned_to", "status", "resolution_notes", "resolved_at", "estimated_cost", "maintenance_id"}

async def _enrich_defects(ws: str, defs: list) -> list:
    v_ids = list({d["vehicle_id"] for d in defs if d.get("vehicle_id")})
    u_ids = list({d[k] for d in defs for k in ("reported_by", "assigned_to") if d.get(k)})
    vmap = {v["id"]: v for v in await fetch_all(
        "select id, name, plate from vehicles where workspace_id = :ws and id = any(:ids)", ws=ws, ids=v_ids,
    )} if v_ids else {}
    umap = {u["id"]: u for u in await fetch_all(
        f"select {SAFE_USER_COLS} from user_profiles where workspace_id = :ws and id = any(:ids)", ws=ws, ids=u_ids,
    )} if u_ids else {}
    for d in defs:
        v = vmap.get(d.get("vehicle_id") or "", {})
        d["vehicle_name"] = v.get("name")
        d["vehicle_plate"] = v.get("plate")
        d["reported_by_name"] = umap.get(d.get("reported_by") or "", {}).get("name")
        d["assigned_to_name"] = umap.get(d.get("assigned_to") or "", {}).get("name")
    return defs

@api.get("/defects")
async def list_defects(user: dict = Depends(get_current_user)):
    defs = await fetch_all("select * from defects where workspace_id = :ws order by created_at desc", ws=user["workspace_id"])
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    defs = _scope_filter(defs, allowed_vehicles, allowed_assets)
    return await _enrich_defects(user["workspace_id"], defs)

@api.post("/defects")
async def create_defect(d: DefectIn, user: dict = Depends(require_module("defects", "full"))):
    if d.client_submission_id:
        existing = await fetch_one(
            "select * from defects where workspace_id = :ws and client_submission_id = :cid",
            ws=user["workspace_id"], cid=d.client_submission_id,
        )
        if existing:
            return (await _enrich_defects(user["workspace_id"], [existing]))[0]
    did = str(uuid.uuid4())
    fields = d.model_dump()
    if user.get("role") not in DEFECT_PRICING_ROLES:
        fields["estimated_cost"] = 0
    await execute(
        "insert into defects (id, workspace_id, vehicle_id, category, severity, description, location, "
        "reported_by, assigned_to, estimated_cost, client_submission_id) values (:id, :ws, :vehicle_id, :category, "
        ":severity, :description, :location, :reported_by, :assigned_to, :estimated_cost, :client_submission_id)",
        id=did, ws=user["workspace_id"], reported_by=user["id"], **fields,
    )
    doc = await fetch_one("select * from defects where id = :id", id=did)
    await log_event(user, "defect.reported", "defect", did, {"category": doc["category"], "severity": doc["severity"]})
    return (await _enrich_defects(user["workspace_id"], [doc]))[0]

@api.patch("/defects/{did}")
async def update_defect(did: str, patch: DefectUpdate, user: dict = Depends(require_module("defects", "full"))):
    data = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if v is not None}
    if "estimated_cost" in data and user.get("role") not in DEFECT_PRICING_ROLES:
        del data["estimated_cost"]
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if data.get("status") == "resolved" and "resolved_at" not in data:
        data["resolved_at"] = datetime.now(timezone.utc)
    existing = await fetch_one("select id from defects where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])
    if not existing:
        raise HTTPException(status_code=404, detail="Defect not found")
    await update_row("defects", did, user["workspace_id"], data, DEFECT_COLS)
    await log_event(user, "defect.updated", "defect", did, {"fields": list(data.keys())})
    doc = await fetch_one("select * from defects where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])
    return (await _enrich_defects(user["workspace_id"], [doc]))[0]

@api.delete("/defects/{did}")
async def delete_defect(did: str, user: dict = Depends(require_module("defects", "full"))):
    await execute("delete from defects where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])
    return {"ok": True}

@api.post("/defects/{did}/convert-to-maintenance")
async def convert_defect_to_maintenance(did: str, user: dict = Depends(require_module("maintenance", "full"))):
    """Feature 7: a controller turns a reported defect into a Maintenance Work Order in one action.
    Completing that job later cascades back and auto-resolves the defect (see update_maintenance's
    completion branch) — Defect, Work Order, and Maintenance Event close together, not as three
    separate manual steps."""
    d = await fetch_one("select * from defects where id = :id and workspace_id = :ws", id=did, ws=user["workspace_id"])
    if not d:
        raise HTTPException(status_code=404, detail="Defect not found")
    if d.get("maintenance_id"):
        raise HTTPException(status_code=400, detail="Defect is already linked to a maintenance job")
    if not d.get("vehicle_id"):
        raise HTTPException(status_code=400, detail="This defect has no vehicle to create a job for")
    vehicle = await fetch_one("select odometer from vehicles where id = :id and workspace_id = :ws", id=d["vehicle_id"], ws=user["workspace_id"])
    mid = str(uuid.uuid4())
    await execute(
        "insert into maintenance (id, workspace_id, vehicle_id, title, description, priority, category, "
        "odometer, status, created_by, actual_cost, downtime_hours) values (:id, :ws, :vid, :title, :description, "
        ":priority, :category, :odometer, 'pending', :uid, 0, 0)",
        id=mid, ws=user["workspace_id"], vid=d["vehicle_id"],
        title=f"Defect repair: {d['description'][:80]}", description=d["description"],
        priority={"low": "low", "medium": "medium", "high": "high", "critical": "critical"}.get(d["severity"], "medium"),
        category=d["category"] if d["category"] in {"tyres", "engine", "brakes", "electrical", "bodywork", "general"} else None,
        odometer=vehicle.get("odometer") if vehicle else None, uid=user["id"],
    )
    await execute(
        "update vehicles set status = 'maintenance' where id = :vid and workspace_id = :ws",
        vid=d["vehicle_id"], ws=user["workspace_id"],
    )
    await update_row("defects", did, user["workspace_id"], {"status": "in_progress", "maintenance_id": mid}, DEFECT_COLS)
    await log_event(user, "defect.converted_to_maintenance", "defect", did, {"maintenance_id": mid})
    job = await fetch_one("select * from maintenance where id = :id", id=mid)
    defect = await fetch_one("select * from defects where id = :id", id=did)
    return {"defect": (await _enrich_defects(user["workspace_id"], [defect]))[0], "job": job}

# --- Fuel logs (real transactions, replacing the old odometer-based estimate) ---
@api.get("/fuel-logs")
async def list_fuel_logs(vehicle_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if vehicle_id:
        logs = await fetch_all(
            "select * from fuel_logs where workspace_id = :ws and vehicle_id = :vid order by occurred_at desc",
            ws=user["workspace_id"], vid=vehicle_id,
        )
    else:
        logs = await fetch_all(
            "select * from fuel_logs where workspace_id = :ws order by occurred_at desc", ws=user["workspace_id"],
        )
    d_ids = list({l["driver_id"] for l in logs if l.get("driver_id")})
    dmap = {d["id"]: d for d in await fetch_all(
        "select id, name from drivers where workspace_id = :ws and id = any(:ids)",
        ws=user["workspace_id"], ids=d_ids,
    )} if d_ids else {}
    for l in logs:
        l["driver_name"] = dmap.get(l.get("driver_id") or "", {}).get("name")
    allowed_vehicles, _ = await _resolve_full_scope(user)
    return _scope_filter(logs, allowed_vehicles, None)

@api.get("/fuel-logs/{lid}")
async def get_fuel_log(lid: str, user: dict = Depends(get_current_user)):
    l = await fetch_one("select * from fuel_logs where id = :id and workspace_id = :ws", id=lid, ws=user["workspace_id"])
    if not l: raise HTTPException(status_code=404, detail="Not found")
    allowed_vehicles, _ = await _resolve_full_scope(user)
    if not _scope_filter([l], allowed_vehicles, None):
        raise HTTPException(status_code=404, detail="Not found")
    v = await fetch_one("select name, plate from vehicles where id = :id", id=l["vehicle_id"]) if l.get("vehicle_id") else None
    d = await fetch_one("select name from drivers where id = :id", id=l["driver_id"]) if l.get("driver_id") else None
    l["vehicle_name"] = v.get("name") if v else None
    l["vehicle_plate"] = v.get("plate") if v else None
    l["driver_name"] = d.get("name") if d else None
    return l

@api.post("/fuel-logs")
async def create_fuel_log(f: FuelLogIn, user: dict = Depends(get_current_user)):
    lid = str(uuid.uuid4())
    fields = f.model_dump()
    fields["occurred_at"] = _parse_datetime(fields["occurred_at"])
    await execute(
        "insert into fuel_logs (id, workspace_id, vehicle_id, driver_id, occurred_at, litres, cost, "
        "location, odometer, created_by) values (:id, :ws, :vehicle_id, :driver_id, :occurred_at, "
        ":litres, :cost, :location, :odometer, :created_by)",
        id=lid, ws=user["workspace_id"], created_by=user["id"], **fields,
    )
    doc = await fetch_one("select * from fuel_logs where id = :id", id=lid)
    await log_event(user, "fuel.logged", "fuel_log", lid, {"vehicle_id": doc["vehicle_id"], "cost": doc["cost"]})
    return doc

@api.delete("/fuel-logs/{lid}")
async def delete_fuel_log(lid: str, user: dict = Depends(get_current_user)):
    await execute("delete from fuel_logs where id = :id and workspace_id = :ws", id=lid, ws=user["workspace_id"])
    return {"ok": True}

# --- Trip logs (real distance-travelled records, for the Trips per Vehicle / Kilometres tiles) ---
@api.get("/trip-logs")
async def list_trip_logs(vehicle_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if vehicle_id:
        logs = await fetch_all(
            "select * from trip_logs where workspace_id = :ws and vehicle_id = :vid order by occurred_at desc",
            ws=user["workspace_id"], vid=vehicle_id,
        )
    else:
        logs = await fetch_all(
            "select * from trip_logs where workspace_id = :ws order by occurred_at desc", ws=user["workspace_id"],
        )
    d_ids = list({l["driver_id"] for l in logs if l.get("driver_id")})
    dmap = {d["id"]: d for d in await fetch_all(
        "select id, name from drivers where workspace_id = :ws and id = any(:ids)",
        ws=user["workspace_id"], ids=d_ids,
    )} if d_ids else {}
    for l in logs:
        l["driver_name"] = dmap.get(l.get("driver_id") or "", {}).get("name")
    allowed_vehicles, _ = await _resolve_full_scope(user)
    return _scope_filter(logs, allowed_vehicles, None)

@api.post("/trip-logs")
async def create_trip_log(t: TripLogIn, user: dict = Depends(get_current_user)):
    tid = str(uuid.uuid4())
    fields = t.model_dump()
    fields["occurred_at"] = _parse_datetime(fields["occurred_at"])
    await execute(
        "insert into trip_logs (id, workspace_id, vehicle_id, driver_id, occurred_at, distance_km, "
        "created_by) values (:id, :ws, :vehicle_id, :driver_id, :occurred_at, :distance_km, :created_by)",
        id=tid, ws=user["workspace_id"], created_by=user["id"], **fields,
    )
    doc = await fetch_one("select * from trip_logs where id = :id", id=tid)
    await log_event(user, "trip.logged", "trip_log", tid, {"vehicle_id": doc["vehicle_id"], "distance_km": doc["distance_km"]})
    return doc

@api.delete("/trip-logs/{tid}")
async def delete_trip_log(tid: str, user: dict = Depends(get_current_user)):
    await execute("delete from trip_logs where id = :id and workspace_id = :ws", id=tid, ws=user["workspace_id"])
    return {"ok": True}

@api.get("/analytics/fleet-health")
async def fleet_health(user: dict = Depends(get_current_user)):
    """Returns per-vehicle health score (0-100) and contributing factors."""
    results = await _compute_fleet_health(user["workspace_id"])
    allowed_vehicles, _ = await _resolve_full_scope(user)
    if allowed_vehicles is not None:
        results = [r for r in results if str(r.get("vehicle_id")) in allowed_vehicles]
    return results

@api.get("/analytics/vehicle/{vid}/health-trend")
async def vehicle_health_trend(vid: str, days: int = 30, user: dict = Depends(get_current_user)):
    """Backfilled daily health score for a single vehicle across the last N days."""
    days = max(7, min(days, 180))
    v = await fetch_one("select * from vehicles where id = :id and workspace_id = :ws", id=vid, ws=user["workspace_id"])
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    allowed_vehicles, _ = await _resolve_full_scope(user)
    if allowed_vehicles is not None and str(vid) not in allowed_vehicles:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    insp = await fetch_all("select * from inspections where workspace_id = :ws and vehicle_id = :vid", ws=user["workspace_id"], vid=vid)
    maint = await fetch_all("select * from maintenance where workspace_id = :ws and vehicle_id = :vid", ws=user["workspace_id"], vid=vid)
    inc = await fetch_all("select * from incidents where workspace_id = :ws and vehicle_id = :vid", ws=user["workspace_id"], vid=vid)
    drivers = await fetch_all("select * from drivers where workspace_id = :ws and assigned_vehicle_id = :vid limit 50", ws=user["workspace_id"], vid=vid)
    driver = drivers[0] if drivers else None
    ws_row = await fetch_one("select license_warning_days from workspaces where id = :id", id=user["workspace_id"])
    license_warning_days = (ws_row or {}).get("license_warning_days") or 30
    now = datetime.now(timezone.utc)
    trend = []
    for delta in range(days - 1, -1, -1):
        as_of = now - timedelta(days=delta)
        r = _score_vehicle(v, insp, maint, inc, driver, as_of=as_of, license_warning_days=license_warning_days)
        trend.append({"date": as_of.date().isoformat(), "score": r["score"], "status": r["status"]})
    return {"vehicle_id": vid, "name": v.get("name"), "plate": v.get("plate"), "trend": trend}

async def _compute_fleet_health(workspace_id: str):
    """Shared computation used by endpoint, trend, and health digest cron."""
    ws_row = await fetch_one("select license_warning_days from workspaces where id = :id", id=workspace_id)
    license_warning_days = (ws_row or {}).get("license_warning_days") or 30
    vehicles = await fetch_all("select * from vehicles where workspace_id = :ws", ws=workspace_id)
    all_insp = await fetch_all("select * from inspections where workspace_id = :ws", ws=workspace_id)
    all_maint = await fetch_all("select * from maintenance where workspace_id = :ws", ws=workspace_id)
    all_inc = await fetch_all("select * from incidents where workspace_id = :ws", ws=workspace_id)
    drivers = await fetch_all("select * from drivers where workspace_id = :ws", ws=workspace_id)
    driver_by_vehicle = {}
    for d in drivers:
        if d.get("assigned_vehicle_id"):
            driver_by_vehicle[d["assigned_vehicle_id"]] = d
    now = datetime.now(timezone.utc)
    results = []
    for v in vehicles:
        results.append(_score_vehicle(v, all_insp, all_maint, all_inc, driver_by_vehicle.get(v["id"]), as_of=now, license_warning_days=license_warning_days))
    results.sort(key=lambda r: r["score"])  # worst first
    return results

def _score_vehicle(v: dict, insp_list: list, maint_list: list, inc_list: list, driver: Optional[dict], as_of: datetime, license_warning_days: int = 30):
    """Deterministic health score (0-100) for a vehicle at a point in time."""
    vid = v["id"]
    ninety = as_of - timedelta(days=90)
    def _parse(d):
        if not d: return None
        if isinstance(d, datetime): return d
        try: return datetime.fromisoformat(str(d).replace("Z", "+00:00"))
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
            exp = driver["license_expiry"]
            exp = exp if hasattr(exp, "year") and not isinstance(exp, datetime) else datetime.strptime(str(exp), "%Y-%m-%d").date()
            days_left = (exp - as_of.date()).days
            if days_left < 0:
                score -= 20
                factors.append({"key": "license_expired", "label": f"Driver license expired ({driver['name']})", "impact": -20})
            elif days_left <= license_warning_days:
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

async def _compute_driver_performance(workspace_id: str):
    """Mirrors _compute_fleet_health, scoped to drivers instead of vehicles."""
    ws_row = await fetch_one("select license_warning_days from workspaces where id = :id", id=workspace_id)
    license_warning_days = (ws_row or {}).get("license_warning_days") or 30
    drivers = await fetch_all("select * from drivers where workspace_id = :ws", ws=workspace_id)
    all_maint = await fetch_all("select * from maintenance where workspace_id = :ws", ws=workspace_id)
    all_inc = await fetch_all("select * from incidents where workspace_id = :ws", ws=workspace_id)
    now = datetime.now(timezone.utc)
    results = [_score_driver(d, all_maint, all_inc, as_of=now, license_warning_days=license_warning_days) for d in drivers]
    results.sort(key=lambda r: r["score"])  # worst first
    return results

def _score_driver(d: dict, maint_list: list, inc_list: list, as_of: datetime, license_warning_days: int = 30):
    """Deterministic performance score (0-100) for a driver, mirroring _score_vehicle."""
    did = d["id"]
    ninety = as_of - timedelta(days=90)
    def _parse(x):
        if not x: return None
        if isinstance(x, datetime): return x
        try: return datetime.fromisoformat(str(x).replace("Z", "+00:00"))
        except Exception: return None
    score = 100
    factors = []
    # Maintenance jobs attributed to this driver, opened in the trailing 90 days
    dmaint = [m for m in maint_list if m.get("driver_id") == did and (_parse(m.get("created_at")) or as_of) <= as_of and (_parse(m.get("created_at")) or as_of) >= ninety]
    critical = [m for m in dmaint if m.get("priority") == "critical"]
    if critical:
        score -= 20
        factors.append({"key": "critical_maintenance", "label": f"{len(critical)} critical maintenance job(s) in 90d", "impact": -20})
    # Incidents attributed to this driver in the trailing 90 days
    dinc = [i for i in inc_list if i.get("driver_id") == did and (_parse(i.get("occurred_at")) or as_of) <= as_of and (_parse(i.get("occurred_at")) or as_of) >= ninety]
    sev_weight = {"severe": 20, "moderate": 12, "minor": 4}
    inc_deduction = min(40, sum(sev_weight.get(i.get("severity"), 4) for i in dinc))
    if inc_deduction > 0:
        score -= inc_deduction
        factors.append({"key": "incidents", "label": f"{len(dinc)} incident(s) in 90d", "impact": -inc_deduction})
    # Own license status
    if d.get("license_expiry"):
        try:
            exp = d["license_expiry"]
            exp = exp if hasattr(exp, "year") and not isinstance(exp, datetime) else datetime.strptime(str(exp), "%Y-%m-%d").date()
            days_left = (exp - as_of.date()).days
            if days_left < 0:
                score -= 20
                factors.append({"key": "license_expired", "label": "License expired", "impact": -20})
            elif days_left <= license_warning_days:
                score -= 8
                factors.append({"key": "license_expiring", "label": f"License expires in {days_left}d", "impact": -8})
        except Exception: pass
    if d.get("status") == "inactive":
        score -= 10
        factors.append({"key": "inactive", "label": "Driver marked inactive", "impact": -10})
    score = max(0, min(100, score))
    status = "healthy" if score >= 80 else "watch" if score >= 55 else "at_risk"
    return {"driver_id": did, "name": d.get("name"), "score": score, "status": status, "factors": factors}

@api.get("/analytics/driver-performance")
async def driver_performance(user: dict = Depends(get_current_user)):
    """Returns per-driver performance score (0-100) and contributing factors."""
    return await _compute_driver_performance(user["workspace_id"])

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
            }
            if not doc["name"] or not doc["plate"]:
                raise ValueError("name and plate required")
            await execute(
                "insert into vehicles (id, workspace_id, name, plate, make, model, year, type, status, "
                "odometer, fuel_cost_per_km) values (:id, :workspace_id, :name, :plate, :make, :model, "
                ":year, :type, :status, :odometer, :fuel_cost_per_km)",
                **doc,
            )
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
            }
            if not doc["sku"] or not doc["name"]:
                raise ValueError("sku and name required")
            await execute(
                "insert into parts (id, workspace_id, sku, name, category, supplier, supplier_email, "
                "stock, reorder_point, unit_cost) values (:id, :workspace_id, :sku, :name, :category, "
                ":supplier, :supplier_email, :stock, :reorder_point, :unit_cost)",
                **doc,
            )
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
            if await fetch_one("select 1 from user_profiles where email = :email and workspace_id = :ws", email=email, ws=user["workspace_id"]):
                raise ValueError("already a member")
            code = secrets.token_urlsafe(12)
            await execute(
                "insert into invites (id, workspace_id, code, email, role, created_by, invitee_name) "
                "values (:id, :ws, :code, :email, :role, :created_by, :name)",
                id=str(uuid.uuid4()), ws=user["workspace_id"], code=code, email=email, role=role,
                created_by=user["id"], name=name,
            )
            created += 1
        except Exception as e:
            errors.append(f"row {i+2}: {e}")
    await log_event(user, "drivers.imported", "invite", "", {"created": created, "errors": len(errors)})
    return {"created": created, "errors": errors}

@api.post("/import/driver-records")
async def import_driver_records(payload: dict, user: dict = Depends(get_current_user)):
    """Bulk-imports fleet driver records (name/license/etc.) into the `drivers` table — distinct from
    /import/drivers above, which invites team-member *users* (email/role) rather than driver records."""
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
                "email": (r.get("email") or "").strip() or None,
                "phone": r.get("phone") or "",
                "license_number": r.get("license_number") or r.get("License Number") or "",
                "license_expiry": _parse_date(r.get("license_expiry") or r.get("License Expiry") or ""),
                "hire_date": _parse_date(r.get("hire_date") or ""),
                "status": (r.get("status") or "active").lower(),
            }
            if not doc["name"] or not doc["license_number"]:
                raise ValueError("name and license_number required")
            await execute(
                "insert into drivers (id, workspace_id, name, email, phone, license_number, license_expiry, "
                "hire_date, status) values (:id, :workspace_id, :name, :email, :phone, :license_number, "
                ":license_expiry, :hire_date, :status)",
                **doc,
            )
            created += 1
        except Exception as e:
            errors.append(f"row {i+2}: {e}")
    await log_event(user, "driver_records.imported", "driver", "", {"created": created, "errors": len(errors)})
    return {"created": created, "errors": errors}

@api.get("/import/vehicles/template.csv")
async def vehicle_import_template():
    csv_text = (
        "name,plate,make,model,year,type,status,odometer,fuel_cost_per_km\n"
        "Falcon-03,FLT-1003,Volvo,FH16,2023,truck,active,0,0.35\n"
    )
    return StreamingResponse(iter([csv_text]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=vehicle-import-template.csv"})

@api.get("/import/driver-records/template.csv")
async def driver_import_template():
    csv_text = (
        "name,email,phone,license_number,license_expiry,hire_date,status\n"
        "Jane Doe,jane@example.com,+27821234567,DL-123456,2027-01-01,2024-01-01,active\n"
    )
    return StreamingResponse(iter([csv_text]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=driver-import-template.csv"})

# --- Weekly digest (PDF + email) ---
async def _build_weekly_digest_pdf(workspace_id: str) -> tuple:
    """Build the digest PDF for a workspace. Returns (pdf_bytes, kpi_dict)."""
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors as rlc
    vehicles = await fetch_all("select * from vehicles where workspace_id = :ws", ws=workspace_id)
    maint = await fetch_all("select * from maintenance where workspace_id = :ws", ws=workspace_id)
    parts = await fetch_all("select * from parts where workspace_id = :ws", ws=workspace_id)
    completed = [m for m in maint if m.get("status") == "completed"]
    pending = [m for m in maint if m.get("status") in ("pending", "in_progress")]
    total_cost = sum(m.get("actual_cost", 0) or 0 for m in completed)
    low_stock = [p for p in parts if (p.get("stock", 0) or 0) <= (p.get("reorder_point", 0) or 0)]
    # Anomalies (reuse logic simplified)
    by_v = {}
    for m in completed:
        d = m.get("completed_at") or m.get("created_at")
        mo = d.strftime("%Y-%m") if d else ""
        if not mo: continue
        by_v.setdefault(m["vehicle_id"], {}).setdefault(mo, 0)
        by_v[m["vehicle_id"]][mo] += float(m.get("actual_cost", 0) or 0)
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
    ws = await fetch_one("select * from workspaces where id = :id", id=workspace_id)
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

async def _run_weekly_digest():
    workspaces = await fetch_all("select id, notification_prefs from workspaces")
    for ws in workspaces:
        if (ws.get("notification_prefs") or {}).get("weekly_digest") is False:
            continue
        try:
            await _send_workspace_digest(ws["id"])
        except Exception as e:
            logger.error(f"digest for {ws.get('id')} failed: {e}")

@api.api_route("/cron/weekly-digest", methods=["GET", "POST"])
async def cron_weekly_digest(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work. GET is for
    # Vercel Cron Jobs (they only invoke via GET); POST remains for manual/testing use.
    auth = request.headers.get("Authorization", "")
    expected = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not expected or not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    asyncio.create_task(_run_weekly_digest())
    return {"ok": True, "queued": True}

@api.post("/workspace/send-digest")
async def send_digest_now(user: dict = Depends(get_current_user)):
    """Manual trigger of the weekly digest for this workspace."""
    email_id = await _send_workspace_digest(user["workspace_id"])
    await log_event(user, "digest.sent", "workspace", user["workspace_id"], {"email_id": email_id})
    return {"sent": bool(email_id), "email_id": email_id}

async def _send_health_digest(workspace_id: str) -> Optional[str]:
    """Emails the workspace owner a list of at-risk & watch vehicles with top factors."""
    ws = await fetch_one("select * from workspaces where id = :id", id=workspace_id) or {"id": workspace_id, "name": "FleetIntel Workspace"}
    owner = await fetch_one("select email, name from user_profiles where workspace_id = :ws and role = 'admin'", ws=workspace_id)
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

@api.api_route("/cron/health-digest", methods=["GET", "POST"])
async def cron_health_digest(request: Request):
    """Manual/testing entry point -- the automated daily tick (see /cron/daily-tick) is what
    actually drives production sends now, since health digest frequency is per-workspace
    configurable rather than fixed. Same due-check logic either way."""
    auth = request.headers.get("Authorization", "")
    expected = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not expected or not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    asyncio.create_task(_run_health_digest_due_check())
    return {"ok": True, "queued": True}

@api.post("/workspace/send-health-digest")
async def send_health_digest_now(user: dict = Depends(get_current_user)):
    """Manual trigger of the health digest for this workspace."""
    email_id = await _send_health_digest(user["workspace_id"])
    if email_id:
        await _mark_health_digest_sent(user["workspace_id"])
    await log_event(user, "health_digest.sent", "workspace", user["workspace_id"], {"email_id": email_id})
    return {"sent": bool(email_id), "email_id": email_id}

# 'each_trip' (used by checklist scheduling's FREQUENCY_DAYS below) doesn't apply here — the health
# digest has no usage-based cadence, only calendar ones, so this is its own mapping.
HEALTH_DIGEST_FREQUENCY_DAYS = {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 91}

def _health_digest_due(prefs: dict) -> bool:
    """Whether a workspace's fleet health digest is due, given its configured frequency and the
    last time one was sent. Defaults to weekly (matching the digest's original fixed schedule) when
    no frequency has been chosen yet."""
    prefs = prefs or {}
    if prefs.get("health_digest") is False:
        return False
    last_sent = prefs.get("health_digest_last_sent_at")
    if not last_sent:
        return True
    freq = prefs.get("health_digest_frequency", "weekly")
    interval_days = HEALTH_DIGEST_FREQUENCY_DAYS.get(freq, 7)
    try:
        last_dt = datetime.fromisoformat(last_sent)
    except (TypeError, ValueError):
        return True
    return (datetime.now(timezone.utc) - last_dt) >= timedelta(days=interval_days)

async def _mark_health_digest_sent(workspace_id: str):
    await execute(
        "update workspaces set notification_prefs = coalesce(notification_prefs, '{}'::jsonb) || :p ::jsonb where id = :id",
        p=json_dumps({"health_digest_last_sent_at": datetime.now(timezone.utc).isoformat()}), id=workspace_id,
    )

async def _run_health_digest_due_check():
    """Sends the fleet health digest to every workspace for which it's currently due (per-workspace
    configurable frequency), not on a fixed schedule -- called from the daily tick, see
    /cron/daily-tick."""
    workspaces = await fetch_all("select id, notification_prefs from workspaces")
    for ws in workspaces:
        if not _health_digest_due(ws.get("notification_prefs")):
            continue
        try:
            email_id = await _send_health_digest(ws["id"])
            if email_id:
                await _mark_health_digest_sent(ws["id"])
        except Exception as e:
            logger.error(f"health digest for {ws.get('id')} failed: {e}")

FREQUENCY_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}  # 'each_trip' is usage-based, not time-based — excluded

async def _compute_overdue_checklists(workspace_id: str):
    """For each active template with a time-based frequency, finds targets (vehicles, or assets/trailers
    per assignment_scope) whose most recent matching inspection is older than the frequency interval, or
    who have never been inspected with that template at all."""
    templates = await fetch_all("select * from templates where workspace_id = :ws and active = true", ws=workspace_id)
    vehicles = await fetch_all("select id, name, group_id from vehicles where workspace_id = :ws", ws=workspace_id)
    assets = await fetch_all("select id, name, kind from assets where workspace_id = :ws", ws=workspace_id)
    vmap = {v["id"]: v for v in vehicles}
    amap = {a["id"]: a for a in assets}
    now = datetime.now(timezone.utc)
    results = []
    for t in templates:
        days = FREQUENCY_DAYS.get(t.get("frequency"))
        if not days:
            continue
        ttype = t.get("type", "vehicle")
        scope = t.get("assignment_scope", "all")
        target_ids = t.get("target_ids") or []
        if ttype == "vehicle":
            if scope == "all":
                targets = [(v["id"], v["name"]) for v in vehicles]
            elif scope == "group":
                targets = [(v["id"], v["name"]) for v in vehicles if v.get("group_id") == t.get("group_id")]
            else:
                targets = [(vid, vmap[vid]["name"]) for vid in target_ids if vid in vmap]
        else:
            if scope == "specific":
                targets = [(aid, amap[aid]["name"]) for aid in target_ids if aid in amap and amap[aid]["kind"] == ttype]
            else:
                targets = [(a["id"], a["name"]) for a in assets if a.get("kind") == ttype]
        for target_id, target_name in targets:
            col = "vehicle_id" if ttype == "vehicle" else "asset_id"
            last = await fetch_one(
                f"select created_at from inspections where template_id = :tid and {col} = :xid order by created_at desc limit 1",
                tid=t["id"], xid=target_id,
            )
            last_at = last["created_at"] if last else None
            if last_at is None or (now - last_at) > timedelta(days=days):
                results.append({
                    "template_id": t["id"], "template_name": t["name"], "target_type": ttype,
                    "target_id": target_id, "target_name": target_name,
                    "last_completed_at": last_at.isoformat() if last_at else None,
                    "days_overdue": (now - last_at).days - days if last_at else None,
                })
    return results

async def _compute_checklist_compliance(workspace_id: str):
    """Same target enumeration as _compute_overdue_checklists, but classifies every (template, target)
    pair — not just the overdue ones — into compliant/due_soon/overdue/missed, for the Compliance
    Dashboard's breakdown and per-vehicle score. 'Due soon' = within the last 20% of the frequency
    window; 'missed' = never inspected with this template at all."""
    templates = await fetch_all("select * from templates where workspace_id = :ws and active = true", ws=workspace_id)
    vehicles = await fetch_all("select id, name, plate, group_id from vehicles where workspace_id = :ws", ws=workspace_id)
    vmap = {v["id"]: v for v in vehicles}
    now = datetime.now(timezone.utc)
    results = []
    for t in templates:
        if t.get("type", "vehicle") != "vehicle":
            continue
        days = FREQUENCY_DAYS.get(t.get("frequency"))
        if not days:
            continue
        scope = t.get("assignment_scope", "all")
        target_ids = t.get("target_ids") or []
        if scope == "all":
            targets = list(vmap.keys())
        elif scope == "group":
            targets = [v["id"] for v in vehicles if v.get("group_id") == t.get("group_id")]
        else:
            targets = [vid for vid in target_ids if vid in vmap]
        for vid in targets:
            last = await fetch_one(
                "select created_at from inspections where template_id = :tid and vehicle_id = :vid order by created_at desc limit 1",
                tid=t["id"], vid=vid,
            )
            last_at = last["created_at"] if last else None
            if last_at is None:
                status = "missed"
            else:
                elapsed = (now - last_at).days
                status = "overdue" if elapsed > days else "due_soon" if elapsed >= days * 0.8 else "compliant"
            results.append({"vehicle_id": vid, "template_id": t["id"], "template_name": t["name"], "status": status})
    return results

@api.get("/compliance/dashboard")
async def compliance_dashboard(user: dict = Depends(require_module("vehicle_checklist", "read"))):
    ws = user["workspace_id"]
    compliance = await _compute_checklist_compliance(ws)
    vehicles = await fetch_all("select id, name, plate from vehicles where workspace_id = :ws", ws=ws)
    maint = await fetch_all(
        "select id, vehicle_id from maintenance where workspace_id = :ws and status in ('pending', 'in_progress')", ws=ws,
    )
    allowed_vehicles, _ = await _resolve_full_scope(user)
    if allowed_vehicles is not None:
        vehicles = [v for v in vehicles if str(v["id"]) in allowed_vehicles]
        compliance = [c for c in compliance if str(c.get("vehicle_id")) in allowed_vehicles]
        maint = [m for m in maint if str(m.get("vehicle_id")) in allowed_vehicles]
    outstanding_by_vehicle = {}
    for m in maint:
        outstanding_by_vehicle[m["vehicle_id"]] = outstanding_by_vehicle.get(m["vehicle_id"], 0) + 1

    by_vehicle = {}
    for c in compliance:
        by_vehicle.setdefault(c["vehicle_id"], []).append(c)

    breakdown = {"compliant": 0, "due_soon": 0, "overdue": 0, "missed": 0}
    for c in compliance:
        breakdown[c["status"]] += 1

    vehicle_rows = []
    for v in vehicles:
        items = by_vehicle.get(v["id"], [])
        bad = [c for c in items if c["status"] in ("overdue", "missed")]
        score = max(0, 100 - min(100, 20 * len(bad)))
        vehicle_rows.append({
            "vehicle_id": v["id"], "vehicle_name": v["name"], "vehicle_plate": v["plate"],
            "compliance_score": score,
            "overdue_templates": [c["template_name"] for c in bad],
            "outstanding_repairs": outstanding_by_vehicle.get(v["id"], 0),
        })
    vehicle_rows.sort(key=lambda r: r["compliance_score"])
    fleet_score = round(sum(r["compliance_score"] for r in vehicle_rows) / len(vehicle_rows), 1) if vehicle_rows else 100.0

    return {
        "fleet_compliance_score": fleet_score,
        "missed_inspections": breakdown["missed"] + breakdown["overdue"],
        "outstanding_repairs": sum(outstanding_by_vehicle.values()),
        "breakdown": breakdown,
        "vehicles": vehicle_rows,
    }

async def _send_overdue_checklists_digest(workspace_id: str) -> Optional[str]:
    """Emails the workspace owner a list of checklists that are past their scheduled frequency."""
    ws = await fetch_one("select * from workspaces where id = :id", id=workspace_id) or {"id": workspace_id, "name": "FleetIntel Workspace"}
    owner = await fetch_one("select email, name from user_profiles where workspace_id = :ws and role = 'admin'", ws=workspace_id)
    if not owner:
        logger.warning(f"overdue-checklists digest for {workspace_id}: no owner/admin to email")
        return None
    overdue = await _compute_overdue_checklists(workspace_id)
    if not overdue:
        return None
    subject = f"{len(overdue)} checklist(s) overdue"
    from_name = os.environ.get("EMAIL_FROM_NAME", "FleetIntel")
    def _row(o: dict) -> str:
        status = "Never completed" if not o["last_completed_at"] else f"{o['days_overdue']}d overdue"
        return (
            f'<tr><td style="padding:12px;border-bottom:1px solid #e2e8f0">'
            f'<div><strong>{escape(o["template_name"])}</strong> — {escape(o["target_name"])} '
            f'<span style="color:#64748b;font-size:12px">({o["target_type"]})</span></div>'
            f'<div style="font-size:12px;color:#dc2626;margin-top:2px">{status}</div>'
            f'</td></tr>'
        )
    rows_html = "".join(_row(o) for o in overdue[:30])
    html = (
        f'<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;color:#0f172a">'
        f'<tr><td style="padding:24px;border-bottom:3px solid #dc2626">'
        f'<div style="font-size:12px;letter-spacing:0.2em;color:#64748b;text-transform:uppercase">{escape(from_name)}</div>'
        f'<h1 style="margin:8px 0 0 0;font-size:22px">Overdue checklists</h1>'
        f'<div style="color:#64748b;margin-top:4px">{escape(ws.get("name", "Workspace"))}</div></td></tr>'
        f'<tr><td style="padding:24px">'
        f'<p style="margin:0 0 16px 0">The following scheduled checklists have not been completed on time.</p>'
        f'<table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0">{rows_html}</table>'
        f'<p style="margin:20px 0 0 0;font-size:12px;color:#888">Sent by {escape(from_name)}. We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )
    return await send_email(to=owner["email"], subject=subject, html=html)

async def _run_overdue_checklists():
    workspaces = await fetch_all("select id, notification_prefs from workspaces")
    for ws in workspaces:
        if (ws.get("notification_prefs") or {}).get("overdue_checklists") is False:
            continue
        try:
            await _send_overdue_checklists_digest(ws["id"])
        except Exception as e:
            logger.error(f"overdue-checklists digest for {ws.get('id')} failed: {e}")

@api.api_route("/cron/overdue-checklists", methods=["GET", "POST"])
async def cron_overdue_checklists(request: Request):
    auth = request.headers.get("Authorization", "")
    expected = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not expected or not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    asyncio.create_task(_run_overdue_checklists())
    return {"ok": True, "queued": True}

@api.api_route("/cron/daily-tick", methods=["GET", "POST"])
async def cron_daily_tick(request: Request):
    """The one daily-scheduled Vercel Cron entry point (see vercel.json) -- runs both
    overdue-checklists (unconditional daily) and the fleet health digest due-check (per-workspace
    configurable frequency). Consolidated into one endpoint to fit within Vercel Hobby's 2
    cron-job limit alongside the separate weekly /cron/weekly-digest entry."""
    auth = request.headers.get("Authorization", "")
    expected = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not expected or not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    asyncio.create_task(_run_overdue_checklists())
    asyncio.create_task(_run_health_digest_due_check())
    return {"ok": True, "queued": True}

FLEET_MANAGER_ROLES = ("manager", "operations_manager", "admin")

async def _run_maintenance_reminders(ws: str) -> int:
    """Feature 9: evaluates every active schedule's due state against its configured time-reminder
    thresholds (Feature 3) and writes one notification per newly-crossed threshold, per assigned
    asset. Idempotent across runs — schedule_due_state.last_fired_thresholds tracks what's already
    fired for the current due cycle, and _reset_schedule_due_state clears it whenever a completion
    re-bases the schedule, so the next due cycle can fire the same thresholds again."""
    schedules = await fetch_all("select id, name from maintenance_schedules where workspace_id = :ws and status = 'active'", ws=ws)
    fired_count = 0
    for sched in schedules:
        interval_rows = await fetch_all("select * from schedule_intervals where schedule_id = :sid", sid=sched["id"])
        reminder_rows = await fetch_all("select * from schedule_reminders where schedule_id = :sid", sid=sched["id"])
        if not interval_rows or not reminder_rows:
            continue
        intervals = [Interval(r["trigger_type"], float(r["every_n"]), r["unit"]) for r in interval_rows]
        reminders = [(r["trigger_type"], float(r["threshold_n"])) for r in reminder_rows]
        due_rows = await fetch_all("select * from schedule_due_state where schedule_id = :sid", sid=sched["id"])
        ref_date = datetime.now(timezone.utc).date()
        for due_row in due_rows:
            if due_row["vehicle_id"]:
                target = await fetch_one("select name, odometer, engine_hours from vehicles where id = :id", id=due_row["vehicle_id"])
                ref_odo, ref_hrs = (target or {}).get("odometer"), (target or {}).get("engine_hours")
            else:
                target = await fetch_one("select name, engine_hours from assets where id = :id", id=due_row["asset_id"])
                ref_odo, ref_hrs = None, (target or {}).get("engine_hours")
            if not target:
                continue
            due = compute_due_state(intervals, base_date=due_row["base_date"], base_odometer=due_row["base_odometer"],
                                     base_hours=due_row["base_hours"], ref_date=ref_date, ref_odometer=ref_odo, ref_hours=ref_hrs)
            already_fired = [(f["trigger_type"], f["threshold_n"]) for f in (due_row["last_fired_thresholds"] or [])]
            newly_fired = reminders_to_fire(intervals, reminders, due, already_fired)
            if not newly_fired:
                continue
            recipients = await fetch_all("select id from user_profiles where workspace_id = :ws and role = any(:roles)", ws=ws, roles=list(FLEET_MANAGER_ROLES))
            days = next((s.remaining for s in due.triggers if s.trigger_type == "time"), None)
            message = f"{target['name']}: {sched['name']} due in {days} day{'s' if days != 1 else ''}"
            for r in recipients:
                await execute(
                    "insert into notifications (id, workspace_id, recipient_user_id, type, message, related_schedule_id) "
                    "values (:id, :ws, :uid, 'maintenance_reminder', :message, :sid)",
                    id=str(uuid.uuid4()), ws=ws, uid=r["id"], message=message, sid=sched["id"],
                )
            await execute(
                "update schedule_due_state set last_fired_thresholds = :f ::jsonb where id = :id",
                f=json_dumps([{"trigger_type": t, "threshold_n": n} for t, n in (already_fired + newly_fired)]), id=due_row["id"],
            )
            fired_count += len(newly_fired)
    return fired_count

@api.post("/cron/maintenance-reminders")
async def cron_maintenance_reminders(request: Request):
    auth = request.headers.get("Authorization", "")
    expected = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not expected or not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    async def _run():
        workspaces = await fetch_all("select id from workspaces")
        for ws in workspaces:
            try:
                await _run_maintenance_reminders(ws["id"])
            except Exception as e:
                logger.error(f"maintenance reminders for {ws.get('id')} failed: {e}")
    asyncio.create_task(_run())
    return {"ok": True, "queued": True}

@api.post("/workspace/send-maintenance-reminders-now")
async def send_maintenance_reminders_now(user: dict = Depends(require_module("maintenance", "full"))):
    """Manual trigger of the reminder sweep for this workspace — same underlying logic as the cron."""
    count = await _run_maintenance_reminders(user["workspace_id"])
    await log_event(user, "maintenance_reminders.sent", "workspace", user["workspace_id"], {"count": count})
    return {"sent": count}

@api.post("/workspace/send-overdue-checklists-alert")
async def send_overdue_checklists_now(user: dict = Depends(get_current_user)):
    """Manual trigger of the overdue-checklists email for this workspace."""
    email_id = await _send_overdue_checklists_digest(user["workspace_id"])
    await log_event(user, "overdue_checklists.sent", "workspace", user["workspace_id"], {"email_id": email_id})
    return {"sent": bool(email_id), "email_id": email_id}

# --- Workspace / Team / Invites ---
@api.get("/workspace")
async def get_workspace(user: dict = Depends(get_current_user)):
    ws = await fetch_one("select * from workspaces where id = :id", id=user["workspace_id"])
    if not ws:
        ws = {"id": user["workspace_id"], "name": "FleetCost Workspace"}
    users = await fetch_all(
        f"select {SAFE_USER_COLS} from user_profiles where workspace_id = :ws",
        ws=user["workspace_id"],
    )
    invites = await fetch_all(
        "select * from invites where workspace_id = :ws order by created_at desc", ws=user["workspace_id"],
    )
    return {"workspace": ws, "members": users, "invites": invites}

@api.patch("/workspace")
async def rename_workspace(req: WorkspaceRename, user: dict = Depends(get_current_user)):
    guarded = (req.currency, req.notification_prefs, req.min_password_length, req.lockout_enabled, req.lockout_threshold, req.report_logo, req.costing_approver_role)
    if any(v is not None for v in guarded) and user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admins/managers can change workspace-wide settings")
    if req.name is not None:
        await execute("update workspaces set name = :name where id = :id", name=req.name, id=user["workspace_id"])
    if req.license_warning_days is not None:
        await execute("update workspaces set license_warning_days = :d where id = :id", d=req.license_warning_days, id=user["workspace_id"])
    if req.currency is not None:
        await execute("update workspaces set currency = :c where id = :id", c=req.currency, id=user["workspace_id"])
    if req.notification_prefs is not None:
        await execute(
            "update workspaces set notification_prefs = coalesce(notification_prefs, '{}'::jsonb) || :p ::jsonb where id = :id",
            p=json_dumps(req.notification_prefs), id=user["workspace_id"],
        )
    if req.min_password_length is not None:
        await execute("update workspaces set min_password_length = :n where id = :id", n=max(6, req.min_password_length), id=user["workspace_id"])
    if req.lockout_enabled is not None:
        await execute("update workspaces set lockout_enabled = :b where id = :id", b=req.lockout_enabled, id=user["workspace_id"])
    if req.lockout_threshold is not None:
        await execute("update workspaces set lockout_threshold = :n where id = :id", n=max(3, req.lockout_threshold), id=user["workspace_id"])
    if req.report_logo is not None:
        if len(req.report_logo) > REPORT_LOGO_MAX_B64_CHARS:
            raise HTTPException(status_code=400, detail="Logo image is too large (max ~1.5MB)")
        await execute("update workspaces set report_logo = :l where id = :id", l=req.report_logo or None, id=user["workspace_id"])
    if req.costing_approver_role is not None:
        if req.costing_approver_role and req.costing_approver_role not in ("operations_manager", "finance", "workshop_head"):
            raise HTTPException(status_code=400, detail="Invalid costing approver role")
        await execute("update workspaces set costing_approver_role = :r where id = :id", r=req.costing_approver_role or None, id=user["workspace_id"])
        if req.costing_approver_role:
            # Materialize the grant into everyone already in that role now -- new hires get it at
            # registration instead (see register()'s target_ws.costing_approver_role check), so this
            # workspace setting stays effective without a repeated per-user Team panel chore.
            # NB: jsonb_set can't create a missing intermediate object for a 2-level path ('{modules,
            # quotes}') -- it silently no-ops when permissions/modules is empty. Merge the whole
            # 'modules' object instead so this works whether or not the user has any permissions yet.
            await execute(
                "update user_profiles set permissions = jsonb_set(coalesce(permissions, '{}'::jsonb), "
                "'{modules}', coalesce(permissions->'modules', '{}'::jsonb) || '{\"quotes\":\"full\"}'::jsonb) "
                "where workspace_id = :ws and role = :role",
                ws=user["workspace_id"], role=req.costing_approver_role,
            )
    return await fetch_one("select * from workspaces where id = :id", id=user["workspace_id"])


@api.post("/workspace/invites")
async def create_invite(req: InviteIn, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admins/managers can invite")
    if await fetch_one("select 1 from user_profiles where email = :email and workspace_id = :ws", email=req.email.lower(), ws=user["workspace_id"]):
        raise HTTPException(status_code=400, detail="User already a member")
    code = secrets.token_urlsafe(12)
    iid = str(uuid.uuid4())
    await execute(
        "insert into invites (id, workspace_id, code, email, role, created_by) "
        "values (:id, :ws, :code, :email, :role, :created_by)",
        id=iid, ws=user["workspace_id"], code=code, email=req.email.lower(), role=req.role, created_by=user["id"],
    )
    doc = await fetch_one("select * from invites where id = :id", id=iid)
    await log_event(user, "invite.created", "invite", iid, {"email": req.email, "role": req.role})
    return doc

@api.delete("/workspace/invites/{iid}")
async def revoke_invite(iid: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await execute("delete from invites where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])
    return {"ok": True}

# --- OCR (Camera OCR) ---
@api.post("/ocr")
async def ocr_image(req: OCRIn, user: dict = Depends(get_current_user)):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="LLM key not configured")
    if LlmChat is None:
        raise HTTPException(status_code=503, detail="OCR unavailable outside Emergent's hosted platform")
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
    vehicles = await fetch_all("select * from vehicles where workspace_id = :ws", ws=user["workspace_id"])
    maint = await fetch_all(
        "select * from maintenance where workspace_id = :ws and status = 'completed'", ws=user["workspace_id"],
    )
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    vehicles = vehicles if allowed_vehicles is None else [v for v in vehicles if str(v["id"]) in allowed_vehicles]
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
    out = []
    for v in vehicles:
        by_month = {}
        for m in maint:
            if m.get("vehicle_id") != v["id"]: continue
            d = m.get("completed_at") or m.get("created_at")
            mo = d.strftime("%Y-%m") if d else ""
            if not mo: continue
            by_month[mo] = by_month.get(mo, 0) + float(m.get("actual_cost", 0) or 0)
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
    maint = await fetch_all(
        "select * from maintenance where workspace_id = :ws and status = 'completed'", ws=user["workspace_id"],
    )
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)
    maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
    buckets = {}
    for m in maint:
        d = m.get("completed_at") or m.get("created_at") or datetime.now(timezone.utc)
        month = d.strftime("%Y-%m")
        buckets[month] = buckets.get(month, 0) + float(m.get("actual_cost", 0) or 0)
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
    user = await user_from_token(token) if token else await get_current_user(request)

    # NOTE: was fetched by id only with no workspace check in the Mongo version (cross-tenant read) — fixed here.
    insp = await fetch_one("select * from inspections where id = :id and workspace_id = :ws", id=iid, ws=user["workspace_id"])
    if not insp: raise HTTPException(status_code=404, detail="Inspection not found")
    if insp.get("vehicle_id"):
        target = await fetch_one("select * from vehicles where id = :id", id=insp["vehicle_id"]) or {}
        target_label = f"{target.get('name','?')}  ({target.get('plate','?')})"
    else:
        target = await fetch_one("select * from assets where id = :id", id=insp["asset_id"]) or {}
        target_label = f"{target.get('name','?')}  ({target.get('identifier') or target.get('kind','?')})"
    template = await fetch_one("select * from templates where id = :id", id=insp["template_id"]) or {"sections": []}
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
        ["Vehicle", target_label, "Inspector", insp.get("inspector_name","")],
        ["Template", template.get("name","?"), "Date", insp["created_at"].strftime("%Y-%m-%d %H:%M") if insp.get("created_at") else ""],
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

    defect_items = []
    for sec in template.get("sections", []):
        for it in sec.get("items", []):
            a = ans_map.get(it["id"], {})
            if str(a.get("value", "")).lower() == "fail":
                defect_items.append((it, a))
    if defect_items:
        story.append(Paragraph("Defects", h2))
        for it, a in defect_items:
            story.append(Paragraph(f'<b>{it.get("label","")}</b>' + (f' — {a["note"]}' if a.get("note") else ""), body))
            photo = a.get("photo")
            if photo:
                try:
                    header, b64data = photo.split(",", 1) if "," in photo else ("", photo)
                    img_bytes = b64.b64decode(b64data)
                    img_buf = io.BytesIO(img_bytes)
                    pil_img = PILImage.open(img_buf)
                    w, h = pil_img.size
                    max_w = 3.0 * inch
                    display_w = min(max_w, w)
                    display_h = display_w * (h / w) if w else display_w
                    img_buf.seek(0)
                    story.append(RLImage(img_buf, width=display_w, height=display_h))
                except Exception as e:
                    logger.warning(f"inspection pdf: failed to embed photo for item {it.get('id')}: {e}")
            story.append(Spacer(1, 8))

    if insp.get("notes"):
        story.append(Paragraph("General notes", h2))
        story.append(Paragraph(insp["notes"], body))

    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · FleetCost Intelligence", small))

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=inspection-{iid[:8]}.pdf"})

@api.get("/maintenance/{mid}/pdf")
async def maintenance_pdf(mid: str, request: Request):
    token = request.query_params.get("token") or None
    user = await user_from_token(token) if token else await get_current_user(request)
    ws = user["workspace_id"]

    job = await fetch_one("select * from maintenance where id = :id and workspace_id = :ws", id=mid, ws=ws)
    if not job: raise HTTPException(status_code=404, detail="Maintenance job not found")
    v = await fetch_one("select name, plate from vehicles where id = :id", id=job["vehicle_id"]) if job.get("vehicle_id") else None
    a = await fetch_one("select name from user_profiles where id = :id", id=job["assigned_to"]) if job.get("assigned_to") else None
    quotes = await fetch_all("select * from quotes where workspace_id = :ws and maintenance_id = :mid order by created_at desc", ws=ws, mid=mid)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.6*inch, rightMargin=0.6*inch)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=colors.HexColor("#0f172a"))
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#334155"), spaceBefore=12, spaceAfter=6)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, textColor=colors.grey)
    story = []

    story.append(Paragraph("FleetCost Intelligence", small))
    story.append(Paragraph("Maintenance Job Summary", h1))
    header_tbl = Table([
        ["Job", job.get("title", ""), "Status", (job.get("status") or "").replace("_", " ")],
        ["Vehicle", f"{v.get('name','?')} ({v.get('plate','?')})" if v else "—", "Priority", job.get("priority", "")],
        ["Category", job.get("category") or "—", "Assigned to", a.get("name") if a else "Unassigned"],
        ["Estimated cost", f"${job.get('estimated_cost', 0) or 0:,.2f}", "Actual cost", f"${job.get('actual_cost', 0) or 0:,.2f}"],
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

    if job.get("description"):
        story.append(Paragraph("Description", h2))
        story.append(Paragraph(job["description"], body))

    STAGE_LABEL = {"pending_ops": "Pending — Operations", "pending_finance": "Pending — Finance", "approved": "Approved", "rejected": "Rejected"}
    for q in quotes:
        story.append(Paragraph(f"Quote — {STAGE_LABEL.get(q['stage'], q['stage'])}", h2))
        story.append(Paragraph(f"Submitted by {q.get('submitted_by_name','?')} on {q['submitted_at'].strftime('%Y-%m-%d') if q.get('submitted_at') else ''}", small))
        rows = [["Type", "Description", "Qty", "Unit cost", "VAT", "Line total"]]
        for it in (q.get("items") or []):
            qty, unit_cost, vat_pct = float(it.get("qty", 0) or 0), float(it.get("unit_cost", 0) or 0), float(it.get("vat_pct", 0) or 0)
            rows.append([it.get("type", ""), it.get("description", ""), str(qty), f"${unit_cost:,.2f}", f"{vat_pct}%", f"${qty * unit_cost * (1 + vat_pct/100):,.2f}"])
        rows.append(["", "", "", "", "Subtotal", f"${float(q.get('subtotal',0) or 0):,.2f}"])
        rows.append(["", "", "", "", "VAT", f"${float(q.get('vat_total',0) or 0):,.2f}"])
        rows.append(["", "", "", "", "Total", f"${float(q.get('total',0) or 0):,.2f}"])
        t = Table(rows, colWidths=[0.8*inch, 2.6*inch, 0.5*inch, 0.9*inch, 0.7*inch, 1.0*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0f172a")),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONT", (0,0), (-1,0), "Helvetica-Bold", 9),
            ("FONT", (0,1), (-1,-1), "Helvetica", 9),
            ("FONT", (4,-3), (-1,-1), "Helvetica-Bold", 9),
            ("GRID", (0,0), (-1,len(rows)-4), 0.25, colors.HexColor("#e2e8f0")),
            ("LINEABOVE", (4,-3), (-1,-3), 0.5, colors.HexColor("#0f172a")),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(t)

        for decision_key, decision_label in (("ops_decision", "Operations"), ("finance_decision", "Finance")):
            d = q.get(decision_key)
            if d:
                line = f"{decision_label}: <b>{d.get('decision','')}</b> by {d.get('by_name','')}" + (f" — {d['reason']}" if d.get("reason") else "")
                story.append(Paragraph(line, small))

        attachments = q.get("attachments") or []
        if attachments:
            story.append(Spacer(1, 6))
            story.append(Paragraph(f"Attachments ({len(attachments)})", small))
            for att in attachments:
                if str(att.get("file_type", "")).startswith("image/") and att.get("data_url"):
                    try:
                        header, b64data = att["data_url"].split(",", 1) if "," in att["data_url"] else ("", att["data_url"])
                        img_bytes = b64.b64decode(b64data)
                        img_buf = io.BytesIO(img_bytes)
                        pil_img = PILImage.open(img_buf)
                        w, h = pil_img.size
                        display_w = min(2.5 * inch, w)
                        display_h = display_w * (h / w) if w else display_w
                        img_buf.seek(0)
                        story.append(RLImage(img_buf, width=display_w, height=display_h))
                    except Exception as e:
                        logger.warning(f"maintenance pdf: failed to embed attachment {att.get('id')}: {e}")
                        story.append(Paragraph(f"— {att.get('file_name','')}", body))
                else:
                    story.append(Paragraph(f"— {att.get('file_name','')}", body))
        story.append(Spacer(1, 10))

    if not quotes:
        story.append(Paragraph("No quote has been submitted for this job yet.", body))

    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · FleetCost Intelligence", small))

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=maintenance-{mid[:8]}.pdf"})

async def _build_incident_pdf(iid: str, workspace_id: Optional[str] = None) -> StreamingResponse:
    """Insurance-ready incident summary: description, vehicle/driver, cost, resolution, and every
    reported photo embedded — a single document an adjuster can be handed directly. Shared by the
    authenticated download (workspace_id enforced) and the public share-link download (the token
    lookup in public_incident_pdf is itself the authorization, so no workspace filter there).
    iid may arrive as a raw asyncpg UUID (a caller passing a DB-read-back id, not a URL path
    param) — normalize to str so the filename slice below doesn't blow up."""
    iid = str(iid)
    if workspace_id:
        inc = await fetch_one("select * from incidents where id = :id and workspace_id = :ws", id=iid, ws=workspace_id)
    else:
        inc = await fetch_one("select * from incidents where id = :id", id=iid)
    if not inc: raise HTTPException(status_code=404, detail="Incident not found")
    v = await fetch_one("select name, plate, make, model from vehicles where id = :id", id=inc["vehicle_id"]) if inc.get("vehicle_id") else None
    d = await fetch_one("select name, license_number from drivers where id = :id", id=inc["driver_id"]) if inc.get("driver_id") else None

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.6*inch, rightMargin=0.6*inch)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=colors.HexColor("#0f172a"))
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#334155"), spaceBefore=12, spaceAfter=6)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, textColor=colors.grey)
    story = []

    story.append(Paragraph("FleetCost Intelligence", small))
    story.append(Paragraph("Incident Report — Insurance Summary", h1))
    occurred = inc.get("occurred_at")
    header_tbl = Table([
        ["Occurred", occurred.strftime("%Y-%m-%d %H:%M") if occurred else "—", "Kind", (inc.get("kind") or "").title()],
        ["Vehicle", f"{v.get('name','?')} ({v.get('plate','?')})" if v else "—", "Severity", (inc.get("severity") or "").title()],
        ["Driver", d.get("name") if d else "Unassigned", "License", d.get("license_number") if d else "—"],
        ["Location", inc.get("location") or "—", "Reported cost", f"${inc.get('reported_cost', 0) or 0:,.2f}"],
        ["Status", "Resolved" if inc.get("resolved") else "Open", "Reported by", inc.get("reporter_name") or "—"],
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

    story.append(Paragraph("Description", h2))
    story.append(Paragraph(inc.get("description") or "—", body))

    if inc.get("resolution_notes"):
        story.append(Paragraph("Resolution", h2))
        story.append(Paragraph(inc["resolution_notes"], body))

    photos = inc.get("photos") or []
    if photos:
        story.append(Paragraph(f"Photos ({len(photos)})", h2))
        for p in photos:
            try:
                header, b64data = p.split(",", 1) if "," in p else ("", p)
                img_bytes = b64.b64decode(b64data)
                img_buf = io.BytesIO(img_bytes)
                pil_img = PILImage.open(img_buf)
                w, h = pil_img.size
                display_w = min(4.0 * inch, w)
                display_h = display_w * (h / w) if w else display_w
                img_buf.seek(0)
                story.append(RLImage(img_buf, width=display_w, height=display_h))
                story.append(Spacer(1, 8))
            except Exception as e:
                logger.warning(f"incident pdf: failed to embed photo for {iid}: {e}")

    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · FleetCost Intelligence", small))

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=incident-{iid[:8]}.pdf"})

@api.get("/incidents/{iid}/pdf")
async def incident_pdf(iid: str, request: Request):
    token = request.query_params.get("token") or None
    user = await user_from_token(token) if token else await get_current_user(request)
    return await _build_incident_pdf(iid, workspace_id=user["workspace_id"])

# --- Seed ---
async def _ensure_user(email: str, name: str, role: str, password: str):
    """Create a Supabase Auth user + user_profiles row if this email doesn't have a profile yet.
    Unlike the old Mongo seed(), this doesn't re-sync password/workspace on every boot once a
    profile exists — Supabase Auth owns password truth after first creation."""
    email = email.lower()
    if await fetch_one("select 1 from user_profiles where email = :email", email=email):
        return
    supa_user = await auth_supabase.admin_create_user(email, password)
    await execute(
        "insert into user_profiles (id, email, name, role, workspace_id) "
        "values (:id, :email, :name, :role, :ws)",
        id=supa_user["id"], email=email, name=name, role=role, ws=DEFAULT_WORKSPACE_ID,
    )
    logger.info(f"Seeded user: {email} ({role})")

# --- Report Center ---
# Saved, named, reusable report definitions. Each definition stores only its config (type, filters,
# chosen/ordered columns) — content is regenerated fresh from live data on every download, never frozen,
# so a re-opened report always reflects current numbers.
REPORT_LOGO_MAX_B64_CHARS = 2_000_000  # ~1.5MB decoded, generous for a logo image

def _rc(key, label):
    return {"key": key, "label": label}

REPORT_TYPES = {
    "maintenance_costing": {
        "label": "Maintenance Costing Report",
        "description": "Completed maintenance jobs with parts, labor, and total cost.",
        "columns": [_rc("vehicle", "Vehicle"), _rc("plate", "Plate"), _rc("title", "Job"), _rc("category", "Category"),
                    _rc("parts_cost", "Parts Cost"), _rc("labor_cost", "Labor Cost"), _rc("total_cost", "Total Cost"),
                    _rc("vendor", "Vendor"), _rc("completed_at", "Completed")],
        "default_columns": ["vehicle", "plate", "title", "category", "total_cost", "completed_at"],
        "filters": [_rc("start", "From"), _rc("end", "To"), _rc("vehicle_id", "Vehicle")],
    },
    "downtime": {
        "label": "Downtime Report",
        "description": "Maintenance jobs with recorded downtime hours and their cost.",
        "columns": [_rc("vehicle", "Vehicle"), _rc("plate", "Plate"), _rc("title", "Job"),
                    _rc("downtime_hours", "Downtime (h)"), _rc("downtime_cost", "Downtime Cost"), _rc("completed_at", "Completed")],
        "default_columns": ["vehicle", "plate", "title", "downtime_hours", "downtime_cost", "completed_at"],
        "filters": [_rc("start", "From"), _rc("end", "To"), _rc("vehicle_id", "Vehicle")],
    },
    "fuel": {
        "label": "Fuel Report",
        "description": "Fuel transactions — litres, cost, and location.",
        "columns": [_rc("vehicle", "Vehicle"), _rc("plate", "Plate"), _rc("litres", "Litres"),
                    _rc("cost", "Cost"), _rc("location", "Location"), _rc("occurred_at", "Date")],
        "default_columns": ["vehicle", "plate", "litres", "cost", "occurred_at"],
        "filters": [_rc("start", "From"), _rc("end", "To"), _rc("vehicle_id", "Vehicle")],
    },
    "parts": {
        "label": "Parts Report",
        "description": "Parts inventory movements — usage, restocks, and adjustments.",
        "columns": [_rc("part_name", "Part"), _rc("sku", "SKU"), _rc("delta", "Qty Change"),
                    _rc("reason", "Reason"), _rc("by_name", "By"), _rc("at", "Date")],
        "default_columns": ["part_name", "sku", "delta", "reason", "at"],
        "filters": [_rc("start", "From"), _rc("end", "To")],
    },
    "incidents": {
        "label": "Incidents Report",
        "description": "Reported incidents — severity, cost, and resolution status.",
        "columns": [_rc("vehicle", "Vehicle"), _rc("plate", "Plate"), _rc("kind", "Kind"), _rc("severity", "Severity"),
                    _rc("description", "Description"), _rc("reported_cost", "Reported Cost"),
                    _rc("resolved", "Resolved"), _rc("occurred_at", "Occurred")],
        "default_columns": ["vehicle", "plate", "kind", "severity", "reported_cost", "occurred_at"],
        "filters": [_rc("start", "From"), _rc("end", "To"), _rc("vehicle_id", "Vehicle")],
    },
    "checklist_compliance": {
        "label": "Checklist Compliance Report",
        "description": "Per-vehicle checklist status against each active template's schedule.",
        "columns": [_rc("vehicle", "Vehicle"), _rc("template_name", "Checklist"), _rc("status", "Status")],
        "default_columns": ["vehicle", "template_name", "status"],
        "filters": [_rc("vehicle_id", "Vehicle")],
    },
    "license_expiry": {
        "label": "Driving Licence Expiry Report",
        "description": "Every driver's licence expiry date and days remaining, soonest first.",
        "columns": [_rc("driver_name", "Driver"), _rc("license_number", "Licence No."), _rc("vehicle", "Assigned Vehicle"),
                    _rc("license_expiry", "Expiry Date"), _rc("days_remaining", "Days Remaining")],
        "default_columns": ["driver_name", "license_number", "license_expiry", "days_remaining"],
        "filters": [],
    },
    "defects": {
        "label": "Defects Report",
        "description": "Reported defects — category, severity, status, and estimated cost.",
        "columns": [_rc("vehicle", "Vehicle"), _rc("plate", "Plate"), _rc("category", "Category"), _rc("severity", "Severity"),
                    _rc("description", "Description"), _rc("status", "Status"), _rc("reported_by_name", "Reported By"),
                    _rc("assigned_to_name", "Assigned To"), _rc("estimated_cost", "Est. Cost"), _rc("created_at", "Reported")],
        "default_columns": ["vehicle", "plate", "category", "severity", "status", "created_at"],
        "filters": [_rc("start", "From"), _rc("end", "To"), _rc("vehicle_id", "Vehicle")],
    },
    "user_activity": {
        "label": "User Activity Report",
        "description": "Audit log of actions taken by teammates in this workspace.",
        "columns": [_rc("user_name", "User"), _rc("action", "Action"), _rc("entity_type", "Entity"), _rc("at", "When")],
        "default_columns": ["user_name", "action", "entity_type", "at"],
        "filters": [_rc("start", "From"), _rc("end", "To")],
    },
    "purchase_orders": {
        "label": "Purchase Orders Report",
        "description": "Issued purchase orders — supplier, amount, and status.",
        "columns": [_rc("po_number", "PO Number"), _rc("supplier", "Supplier"), _rc("amount", "Amount"),
                    _rc("status", "Status"), _rc("created_at", "Created")],
        "default_columns": ["po_number", "supplier", "amount", "status", "created_at"],
        "filters": [_rc("start", "From"), _rc("end", "To")],
    },
    "budget_vs_actual": {
        "label": "Budget vs Actual Report",
        "description": "Per-category budget utilization for a given year.",
        "columns": [_rc("category", "Category"), _rc("budget", "Budget"), _rc("actual", "Actual"),
                    _rc("utilization", "Utilization %"), _rc("status", "Status")],
        "default_columns": ["category", "budget", "actual", "utilization", "status"],
        "filters": [_rc("year", "Year")],
    },
}

def _report_date_range(filters: dict):
    start = end = None
    try:
        if filters.get("start"): start = datetime.fromisoformat(filters["start"]).date()
        if filters.get("end"): end = datetime.fromisoformat(filters["end"]).date()
    except ValueError:
        pass
    return start, end

def _in_date_range(dt, start, end) -> bool:
    if dt is None: return start is None and end is None
    d = dt.date() if isinstance(dt, datetime) else dt
    if start and d < start: return False
    if end and d > end: return False
    return True

async def _fetch_report_rows(report_type: str, user: dict, filters: dict) -> list:
    ws = user["workspace_id"]
    start, end = _report_date_range(filters)
    vehicle_id = filters.get("vehicle_id") or None
    allowed_vehicles, allowed_assets = await _resolve_full_scope(user)

    if report_type in ("maintenance_costing", "downtime"):
        maint = await fetch_all("select * from maintenance where workspace_id = :ws and status = 'completed'", ws=ws)
        maint = _scope_filter(maint, allowed_vehicles, allowed_assets)
        if vehicle_id: maint = [m for m in maint if m.get("vehicle_id") == vehicle_id]
        maint = [m for m in maint if _in_date_range(m.get("completed_at"), start, end)]
        vehicles = await fetch_all("select id, name, plate, downtime_cost_per_hour from vehicles where workspace_id = :ws", ws=ws)
        vmap = {v["id"]: v for v in vehicles}
        if report_type == "maintenance_costing":
            return [{
                "vehicle": vmap.get(m.get("vehicle_id"), {}).get("name", "—"),
                "plate": vmap.get(m.get("vehicle_id"), {}).get("plate", ""),
                "title": m.get("title", ""), "category": m.get("category") or "",
                "parts_cost": round(float(m.get("parts_cost") or 0), 2),
                "labor_cost": round(float(m.get("labor_cost") or 0), 2),
                "total_cost": round(float(m.get("actual_cost") or 0), 2),
                "vendor": m.get("vendor") or "", "completed_at": _d10(m.get("completed_at")),
            } for m in maint]
        maint = [m for m in maint if (m.get("downtime_hours") or 0) > 0]
        return [{
            "vehicle": vmap.get(m.get("vehicle_id"), {}).get("name", "—"),
            "plate": vmap.get(m.get("vehicle_id"), {}).get("plate", ""),
            "title": m.get("title", ""), "downtime_hours": float(m.get("downtime_hours") or 0),
            "downtime_cost": round(float(m.get("downtime_hours") or 0) * float(vmap.get(m.get("vehicle_id"), {}).get("downtime_cost_per_hour") or 0), 2),
            "completed_at": _d10(m.get("completed_at")),
        } for m in maint]

    if report_type == "fuel":
        logs = await fetch_all("select * from fuel_logs where workspace_id = :ws", ws=ws)
        logs = _scope_filter(logs, allowed_vehicles, None)
        if vehicle_id: logs = [f for f in logs if f.get("vehicle_id") == vehicle_id]
        logs = [f for f in logs if _in_date_range(f.get("occurred_at"), start, end)]
        vmap = {v["id"]: v for v in await fetch_all("select id, name, plate from vehicles where workspace_id = :ws", ws=ws)}
        return [{
            "vehicle": vmap.get(f.get("vehicle_id"), {}).get("name", "—"),
            "plate": vmap.get(f.get("vehicle_id"), {}).get("plate", ""),
            "litres": float(f.get("litres") or 0), "cost": round(float(f.get("cost") or 0), 2),
            "location": f.get("location") or "", "occurred_at": _d10(f.get("occurred_at")),
        } for f in logs]

    if report_type == "parts":
        rows = await fetch_all("select * from parts_history where workspace_id = :ws order by at desc", ws=ws)
        rows = [r for r in rows if _in_date_range(r.get("at"), start, end)]
        pids = list({r["part_id"] for r in rows if r.get("part_id")})
        pmap = {p["id"]: p for p in (await fetch_all("select id, name, sku from parts where id = any(:ids)", ids=pids) if pids else [])}
        uids = list({r["by"] for r in rows if r.get("by")})
        umap = {u["id"]: u for u in (await fetch_all("select id, name from user_profiles where id = any(:ids)", ids=uids) if uids else [])}
        return [{
            "part_name": pmap.get(r.get("part_id"), {}).get("name") or "—", "sku": pmap.get(r.get("part_id"), {}).get("sku") or "",
            "delta": float(r.get("delta") or 0), "reason": r.get("reason") or "",
            "by_name": umap.get(r.get("by"), {}).get("name", ""), "at": _d10(r.get("at")),
        } for r in rows]

    if report_type == "incidents":
        incs = await fetch_all("select * from incidents where workspace_id = :ws", ws=ws)
        incs = _scope_filter(incs, allowed_vehicles, None)
        if vehicle_id: incs = [i for i in incs if i.get("vehicle_id") == vehicle_id]
        incs = [i for i in incs if _in_date_range(i.get("occurred_at"), start, end)]
        vmap = {v["id"]: v for v in await fetch_all("select id, name, plate from vehicles where workspace_id = :ws", ws=ws)}
        return [{
            "vehicle": vmap.get(i.get("vehicle_id"), {}).get("name", "—"),
            "plate": vmap.get(i.get("vehicle_id"), {}).get("plate", ""),
            "kind": i.get("kind") or "", "severity": i.get("severity") or "",
            "description": i.get("description") or "", "reported_cost": round(float(i.get("reported_cost") or 0), 2),
            "resolved": "Yes" if i.get("resolved") else "No", "occurred_at": _d10(i.get("occurred_at")),
        } for i in incs]

    if report_type == "checklist_compliance":
        compliance = await _compute_checklist_compliance(ws)
        if vehicle_id: compliance = [c for c in compliance if c.get("vehicle_id") == vehicle_id]
        if allowed_vehicles is not None:
            compliance = [c for c in compliance if str(c.get("vehicle_id")) in allowed_vehicles]
        vmap = {v["id"]: v for v in await fetch_all("select id, name from vehicles where workspace_id = :ws", ws=ws)}
        return [{
            "vehicle": vmap.get(c.get("vehicle_id"), {}).get("name", "—"),
            "template_name": c.get("template_name", ""), "status": (c.get("status") or "").replace("_", " ").title(),
        } for c in compliance]

    if report_type == "license_expiry":
        drivers = await fetch_all("select * from drivers where workspace_id = :ws and license_expiry is not null", ws=ws)
        vmap = {v["id"]: v for v in await fetch_all("select id, name from vehicles where workspace_id = :ws", ws=ws)}
        today = datetime.now(timezone.utc).date()
        rows = [{
            "driver_name": d.get("name", ""), "license_number": d.get("license_number") or "",
            "vehicle": vmap.get(d.get("assigned_vehicle_id"), {}).get("name", "—") if d.get("assigned_vehicle_id") else "—",
            "license_expiry": str(d["license_expiry"]), "days_remaining": (d["license_expiry"] - today).days,
        } for d in drivers]
        return sorted(rows, key=lambda r: r["days_remaining"])

    if report_type == "defects":
        defs = await fetch_all("select * from defects where workspace_id = :ws order by created_at desc", ws=ws)
        defs = _scope_filter(defs, allowed_vehicles, allowed_assets)
        if vehicle_id: defs = [d for d in defs if d.get("vehicle_id") == vehicle_id]
        defs = [d for d in defs if _in_date_range(d.get("created_at"), start, end)]
        defs = await _enrich_defects(ws, defs)
        return [{
            "vehicle": d.get("vehicle_name") or "—", "plate": d.get("vehicle_plate") or "",
            "category": d.get("category") or "", "severity": d.get("severity") or "",
            "description": d.get("description") or "", "status": (d.get("status") or "").replace("_", " ").title(),
            "reported_by_name": d.get("reported_by_name") or "", "assigned_to_name": d.get("assigned_to_name") or "",
            "estimated_cost": round(float(d.get("estimated_cost") or 0), 2), "created_at": _d10(d.get("created_at")),
        } for d in defs]

    if report_type == "user_activity":
        rows = await fetch_all("select * from audit_log where workspace_id = :ws order by at desc limit 2000", ws=ws)
        rows = [r for r in rows if _in_date_range(r.get("at"), start, end)]
        return [{
            "user_name": r.get("user_name") or "", "action": r.get("action") or "",
            "entity_type": r.get("entity_type") or "", "at": r.get("at").strftime("%Y-%m-%d %H:%M") if r.get("at") else "",
        } for r in rows]

    if report_type == "purchase_orders":
        rows = await fetch_all("select * from purchase_orders where workspace_id = :ws order by created_at desc", ws=ws)
        rows = [r for r in rows if _in_date_range(r.get("created_at"), start, end)]
        return [{
            "po_number": r.get("po_number") or "", "supplier": r.get("supplier") or "",
            "amount": round(float(r.get("amount") or 0), 2), "status": (r.get("status") or "").replace("_", " ").title(),
            "created_at": _d10(r.get("created_at")),
        } for r in rows]

    if report_type == "budget_vs_actual":
        year = int(filters.get("year") or datetime.now(timezone.utc).year)
        rows = await _budget_summary(ws, year, allowed_vehicles, allowed_assets)
        return [{
            "category": r["category"].replace("_", " ").title(), "budget": r["budget"], "actual": r["actual"],
            "utilization": r.get("utilization", 0), "status": (r.get("status") or "").replace("_", " ").title(),
        } for r in rows]

    raise HTTPException(status_code=404, detail="Unknown report type")

def _report_csv(rows: list, columns: list, filename: str) -> StreamingResponse:
    import csv
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
    writer.writerow([c["label"] for c in columns])
    for r in rows:
        writer.writerow([r.get(c["key"], "") for c in columns])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"})

def _report_pdf(title: str, ws_row: dict, page_format: str, columns: list, rows: list) -> io.BytesIO:
    from reportlab.lib.pagesizes import landscape as rl_landscape
    from reportlab.lib import colors as rlc
    buf = io.BytesIO()
    pagesize = rl_landscape(LETTER) if page_format == "landscape" else LETTER
    doc = SimpleDocTemplate(buf, pagesize=pagesize, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.6*inch, rightMargin=0.6*inch)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=20, textColor=rlc.HexColor("#0f172a"))
    small = ParagraphStyle("small", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, textColor=rlc.grey)
    story = []
    logo = (ws_row or {}).get("report_logo")
    if logo and logo.startswith("data:image"):
        try:
            _, b64data = logo.split(",", 1)
            img_buf = io.BytesIO(b64.b64decode(b64data))
            story.append(RLImage(img_buf, width=1.4*inch, height=0.6*inch))
            story.append(Spacer(1, 8))
        except Exception:
            pass
    story.append(Paragraph(escape((ws_row or {}).get("name") or "FleetIntel"), small))
    story.append(Paragraph(escape(title), h1))
    story.append(Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%B %d, %Y %H:%M UTC')} · {len(rows)} row(s)", small))
    story.append(Spacer(1, 14))
    if rows:
        table_rows = [[c["label"] for c in columns]] + [[str(r.get(c["key"], "")) for c in columns] for r in rows]
        col_count = len(columns)
        avail_width = pagesize[0] - 1.2*inch
        t = Table(table_rows, colWidths=[avail_width / col_count] * col_count, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), rlc.HexColor("#0f172a")),
            ("TEXTCOLOR", (0,0), (-1,0), rlc.white),
            ("FONT", (0,0), (-1,0), "Helvetica-Bold", 8),
            ("FONT", (0,1), (-1,-1), "Helvetica", 8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [rlc.HexColor("#f8fafc"), rlc.white]),
            ("GRID", (0,0), (-1,-1), 0.25, rlc.HexColor("#e2e8f0")),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("No data for the selected filters.", styles["BodyText"]))
    doc.build(story)
    buf.seek(0)
    return buf

def _resolve_columns(report_type: str, requested: list) -> list:
    all_cols = {c["key"]: c for c in REPORT_TYPES[report_type]["columns"]}
    keys = requested or REPORT_TYPES[report_type]["default_columns"]
    return [all_cols[k] for k in keys if k in all_cols]

@api.get("/reports/types")
async def list_report_types(user: dict = Depends(get_current_user)):
    return [{"key": k, **v} for k, v in REPORT_TYPES.items()]

@api.get("/reports/definitions")
async def list_report_definitions(user: dict = Depends(get_current_user)):
    return await fetch_all(
        "select * from report_definitions where workspace_id = :ws order by created_at desc", ws=user["workspace_id"],
    )

@api.post("/reports/definitions")
async def create_report_definition(req: ReportDefinitionIn, user: dict = Depends(get_current_user)):
    if req.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown report type")
    rid = str(uuid.uuid4())
    await execute(
        "insert into report_definitions (id, workspace_id, name, report_type, file_type, page_format, columns, filters, created_by) "
        "values (:id, :ws, :name, :rt, :ft, :pf, :cols ::jsonb, :filters ::jsonb, :by)",
        id=rid, ws=user["workspace_id"], name=req.name, rt=req.report_type, ft=req.file_type, pf=req.page_format,
        cols=json_dumps(req.columns), filters=json_dumps(req.filters), by=user["id"],
    )
    await log_event(user, "report.created", "report_definition", rid, {"name": req.name, "type": req.report_type})
    return await fetch_one("select * from report_definitions where id = :id", id=rid)

@api.patch("/reports/definitions/{rid}")
async def update_report_definition(rid: str, req: ReportDefinitionUpdate, user: dict = Depends(get_current_user)):
    existing = await fetch_one("select * from report_definitions where id = :id and workspace_id = :ws", id=rid, ws=user["workspace_id"])
    if not existing: raise HTTPException(status_code=404, detail="Not found")
    patch = req.model_dump(exclude_unset=True)
    if patch:
        patch["updated_at"] = datetime.now(timezone.utc)
        await update_row("report_definitions", rid, user["workspace_id"], patch,
                          {"name", "file_type", "page_format", "columns", "filters", "updated_at"})
    return await fetch_one("select * from report_definitions where id = :id", id=rid)

@api.delete("/reports/definitions/{rid}")
async def delete_report_definition(rid: str, user: dict = Depends(get_current_user)):
    await execute("delete from report_definitions where id = :id and workspace_id = :ws", id=rid, ws=user["workspace_id"])
    return {"ok": True}

@api.post("/reports/preview")
async def preview_report(req: ReportPreviewIn, user: dict = Depends(get_current_user)):
    if req.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown report type")
    columns = _resolve_columns(req.report_type, req.columns)
    rows = await _fetch_report_rows(req.report_type, user, req.filters)
    return {"columns": columns, "rows": rows[:50], "total": len(rows)}

@api.get("/reports/definitions/{rid}/download")
async def download_report(rid: str, request: Request, format: Optional[str] = None):
    token = request.query_params.get("token") or None
    user = await user_from_token(token) if token else await get_current_user(request)
    rep = await fetch_one("select * from report_definitions where id = :id and workspace_id = :ws", id=rid, ws=user["workspace_id"])
    if not rep: raise HTTPException(status_code=404, detail="Not found")
    file_type = format or rep["file_type"]
    columns = _resolve_columns(rep["report_type"], rep.get("columns") or [])
    rows = await _fetch_report_rows(rep["report_type"], user, rep.get("filters") or {})
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", rep["name"]).strip("_") or "report"
    if file_type == "csv":
        return _report_csv(rows, columns, f"{safe_name}.csv")
    ws_row = await fetch_one("select name, report_logo from workspaces where id = :id", id=user["workspace_id"])
    buf = _report_pdf(rep["name"], ws_row, rep.get("page_format") or "portrait", columns, rows)
    return StreamingResponse(iter([buf.read()]), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={safe_name}.pdf"})

async def seed():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]

    # Ensure default workspace exists
    if not await fetch_one("select 1 from workspaces where id = :id", id=DEFAULT_WORKSPACE_ID):
        await execute(
            "insert into workspaces (id, name, owner_email) values (:id, :name, :email)",
            id=DEFAULT_WORKSPACE_ID, name="FleetCost Demo Workspace", email=admin_email,
        )

    await _ensure_user(admin_email, "Fleet Owner", "admin", admin_password)
    for email, name, role, pw in [
        ("manager@fleet.com", "Marcus Chen", "manager", "manager123"),
        ("inspector@fleet.com", "Sara Ortiz", "inspector", "inspector123"),
        ("mechanic@fleet.com", "Dan Fields", "mechanic", "mechanic123"),
    ]:
        await _ensure_user(email, name, role, pw)

    # Vehicles
    if not await fetch_one("select 1 from vehicles where workspace_id = :ws", ws=DEFAULT_WORKSPACE_ID):
        vs = [
            {"name": "Falcon-01", "plate": "FLT-1001", "make": "Volvo", "model": "FH16", "year": 2022, "type": "truck", "status": "active", "odometer": 148200, "fuel_cost_per_km": 0.42, "downtime_cost_per_hour": 65, "image_url": "https://images.unsplash.com/photo-1695222833131-54ee679ae8e5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHw0fHxmbGVldCUyMHZlaGljbGUlMjB0cnVjayUyMGRyaXZpbmd8ZW58MHx8fHwxNzg2NjA5NjczfDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Falcon-02", "plate": "FLT-1002", "make": "Scania", "model": "R500", "year": 2021, "type": "truck", "status": "maintenance", "odometer": 210400, "fuel_cost_per_km": 0.45, "downtime_cost_per_hour": 70, "image_url": "https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHwzfHxmbGVldCUyMHZlaGljbGUlMjB0cnVjayUyMGRyaXZpbmd8ZW58MHx8fHwxNzg2NjA5NjczfDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Raven-11", "plate": "FLT-2011", "make": "Ford", "model": "Transit", "year": 2023, "type": "van", "status": "active", "odometer": 45000, "fuel_cost_per_km": 0.28, "downtime_cost_per_hour": 40},
            {"name": "Raven-12", "plate": "FLT-2012", "make": "Mercedes", "model": "Sprinter", "year": 2020, "type": "van", "status": "idle", "odometer": 189000, "fuel_cost_per_km": 0.31, "downtime_cost_per_hour": 42},
            {"name": "Titan-31", "plate": "FLT-3031", "make": "Peterbilt", "model": "579", "year": 2019, "type": "truck", "status": "active", "odometer": 315000, "fuel_cost_per_km": 0.48, "downtime_cost_per_hour": 75},
            {"name": "Titan-32", "plate": "FLT-3032", "make": "Kenworth", "model": "T680", "year": 2022, "type": "truck", "status": "active", "odometer": 92800, "fuel_cost_per_km": 0.44, "downtime_cost_per_hour": 68},
        ]
        for v in vs:
            v["id"] = str(uuid.uuid4())
            v["workspace_id"] = DEFAULT_WORKSPACE_ID
            v.setdefault("image_url", None)
        await execute_many(
            "insert into vehicles (id, workspace_id, name, plate, make, model, year, type, status, "
            "odometer, fuel_cost_per_km, downtime_cost_per_hour, image_url) values (:id, :workspace_id, :name, :plate, :make, "
            ":model, :year, :type, :status, :odometer, :fuel_cost_per_km, :downtime_cost_per_hour, :image_url)",
            vs,
        )

    # Default template
    if not await fetch_one("select 1 from templates where workspace_id = :ws", ws=DEFAULT_WORKSPACE_ID):
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
        }
        await execute(
            "insert into templates (id, workspace_id, name, description, sections, created_by, version, family_id) "
            "values (:id, :ws, :name, :description, :sections ::jsonb, null, 1, :id)",
            id=template["id"], ws=DEFAULT_WORKSPACE_ID, name=template["name"],
            description=template["description"], sections=json_dumps(template["sections"]),
        )

    # Sample maintenance history (for KPIs)
    if not await fetch_one("select 1 from maintenance where workspace_id = :ws", ws=DEFAULT_WORKSPACE_ID):
        vehicles = await fetch_all("select id from vehicles where workspace_id = :ws limit 100", ws=DEFAULT_WORKSPACE_ID)
        if vehicles:
            samples = [
                {"vehicle_id": vehicles[0]["id"], "title": "Oil & filter change", "priority": "low", "category": "engine", "parts_cost": 85, "labor_cost": 60, "downtime_hours": 1.5, "status": "completed", "months_ago": 4},
                {"vehicle_id": vehicles[0]["id"], "title": "Brake pad replacement", "priority": "medium", "category": "brakes", "parts_cost": 240, "labor_cost": 180, "downtime_hours": 3.0, "status": "completed", "months_ago": 2},
                {"vehicle_id": vehicles[1]["id"], "title": "Turbocharger repair", "priority": "high", "category": "engine", "parts_cost": 1800, "labor_cost": 900, "downtime_hours": 18, "status": "in_progress", "months_ago": 0},
                {"vehicle_id": vehicles[2]["id"], "title": "Tire rotation", "priority": "low", "category": "tyres", "parts_cost": 0, "labor_cost": 80, "downtime_hours": 1.0, "status": "completed", "months_ago": 3},
                {"vehicle_id": vehicles[3]["id"], "title": "Transmission service", "priority": "medium", "category": "engine", "parts_cost": 320, "labor_cost": 260, "downtime_hours": 4.5, "status": "completed", "months_ago": 1},
                {"vehicle_id": vehicles[4]["id"], "title": "Coolant flush", "priority": "low", "category": "engine", "parts_cost": 55, "labor_cost": 90, "downtime_hours": 2.0, "status": "completed", "months_ago": 5},
                {"vehicle_id": vehicles[4]["id"], "title": "Suspension inspection", "priority": "medium", "category": "general", "parts_cost": 420, "labor_cost": 340, "downtime_hours": 5.5, "status": "pending", "months_ago": 0},
                {"vehicle_id": vehicles[5]["id"], "title": "Air filter replacement", "priority": "low", "category": "engine", "parts_cost": 45, "labor_cost": 40, "downtime_hours": 0.75, "status": "completed", "months_ago": 2},
                {"vehicle_id": vehicles[1]["id"], "title": "New tyre set (rear axle)", "priority": "medium", "category": "tyres", "parts_cost": 760, "labor_cost": 120, "downtime_hours": 2.5, "status": "completed", "months_ago": 1},
                {"vehicle_id": vehicles[5]["id"], "title": "Tyre puncture repair", "priority": "low", "category": "tyres", "parts_cost": 30, "labor_cost": 35, "downtime_hours": 0.5, "status": "completed", "months_ago": 0},
            ]
            rows = []
            for s in samples:
                created = datetime.now(timezone.utc) - timedelta(days=30 * s["months_ago"])
                completed = created if s["status"] == "completed" else None
                actual = (s["parts_cost"] + s["labor_cost"]) if s["status"] == "completed" else 0
                rows.append({
                    "id": str(uuid.uuid4()), "workspace_id": DEFAULT_WORKSPACE_ID, "vehicle_id": s["vehicle_id"],
                    "title": s["title"], "description": "", "priority": s["priority"], "category": s["category"],
                    "estimated_cost": s["parts_cost"] + s["labor_cost"], "estimated_hours": s["downtime_hours"],
                    "parts_cost": s["parts_cost"], "labor_cost": s["labor_cost"], "actual_cost": actual,
                    "downtime_hours": s["downtime_hours"] if s["status"] == "completed" else 0,
                    "status": s["status"], "created_at": created, "completed_at": completed,
                })
            await execute_many(
                "insert into maintenance (id, workspace_id, vehicle_id, title, description, priority, category, "
                "estimated_cost, estimated_hours, parts_cost, labor_cost, actual_cost, downtime_hours, "
                "status, created_at, completed_at) values (:id, :workspace_id, :vehicle_id, :title, "
                ":description, :priority, :category, :estimated_cost, :estimated_hours, :parts_cost, :labor_cost, "
                ":actual_cost, :downtime_hours, :status, :created_at, :completed_at)",
                rows,
            )

    # Sample fuel transactions (for the real Fuel Cost tile + drill-down, replacing the old estimate)
    if not await fetch_one("select 1 from fuel_logs where workspace_id = :ws", ws=DEFAULT_WORKSPACE_ID):
        vehicles = await fetch_all("select id from vehicles where workspace_id = :ws limit 100", ws=DEFAULT_WORKSPACE_ID)
        if vehicles:
            locations = ["Shell N1 Depot", "Engen Midrand", "Sasol Waterfall", "BP Centurion", "Total Alberton"]
            fuel_rows = []
            for i, v in enumerate(vehicles):
                # 4 purchases each, spread over the last ~3 months, litres/cost varying by vehicle
                base_litres = 180 if i % 3 == 0 else 90
                for j in range(4):
                    days_ago = 7 + j * 24 + (i * 3)
                    litres = round(base_litres * (0.85 + 0.3 * ((i + j) % 3) / 2), 1)
                    cost = round(litres * 1.35, 2)
                    fuel_rows.append({
                        "id": str(uuid.uuid4()), "workspace_id": DEFAULT_WORKSPACE_ID, "vehicle_id": v["id"],
                        "driver_id": None, "occurred_at": datetime.now(timezone.utc) - timedelta(days=days_ago),
                        "litres": litres, "cost": cost, "location": locations[(i + j) % len(locations)],
                        "odometer": None, "created_by": None,
                    })
            await execute_many(
                "insert into fuel_logs (id, workspace_id, vehicle_id, driver_id, occurred_at, litres, "
                "cost, location, odometer, created_by) values (:id, :workspace_id, :vehicle_id, :driver_id, "
                ":occurred_at, :litres, :cost, :location, :odometer, :created_by)",
                fuel_rows,
            )

    # Sample drivers (for the Driver Performance tile + drill-down)
    if not await fetch_one("select 1 from drivers where workspace_id = :ws", ws=DEFAULT_WORKSPACE_ID):
        vehicles = await fetch_all("select id from vehicles where workspace_id = :ws order by created_at limit 100", ws=DEFAULT_WORKSPACE_ID)
        if vehicles:
            today = datetime.now(timezone.utc).date()
            driver_samples = [
                {"name": "Thabo Nkosi", "license_number": "DL-88213", "license_expiry": today + timedelta(days=400), "assigned_vehicle_id": vehicles[0]["id"], "status": "active"},
                {"name": "Sipho Dlamini", "license_number": "DL-77410", "license_expiry": today + timedelta(days=20), "assigned_vehicle_id": vehicles[1]["id"], "status": "active"},
                {"name": "Naledi Mokoena", "license_number": "DL-65302", "license_expiry": today + timedelta(days=250), "assigned_vehicle_id": vehicles[2]["id"], "status": "active"},
                {"name": "Kagiso Molefe", "license_number": "DL-54118", "license_expiry": today - timedelta(days=5), "assigned_vehicle_id": vehicles[3]["id"], "status": "active"},
                {"name": "Zanele Khumalo", "license_number": "DL-91205", "license_expiry": today + timedelta(days=180), "assigned_vehicle_id": None, "status": "inactive"},
            ]
            drows = []
            for d in driver_samples:
                drows.append({
                    "id": str(uuid.uuid4()), "workspace_id": DEFAULT_WORKSPACE_ID, "name": d["name"],
                    "email": None, "phone": None, "license_number": d["license_number"],
                    "license_expiry": d["license_expiry"], "hire_date": None,
                    "assigned_vehicle_id": d["assigned_vehicle_id"], "status": d["status"], "notes": "",
                })
            await execute_many(
                "insert into drivers (id, workspace_id, name, email, phone, license_number, license_expiry, "
                "hire_date, assigned_vehicle_id, status, notes) values (:id, :workspace_id, :name, :email, "
                ":phone, :license_number, :license_expiry, :hire_date, :assigned_vehicle_id, :status, :notes)",
                drows,
            )

    # Sample trip logs (for the Trips per Vehicle tile + drill-down)
    if not await fetch_one("select 1 from trip_logs where workspace_id = :ws", ws=DEFAULT_WORKSPACE_ID):
        vehicles = await fetch_all("select id from vehicles where workspace_id = :ws limit 100", ws=DEFAULT_WORKSPACE_ID)
        if vehicles:
            trip_rows = []
            for i, v in enumerate(vehicles):
                for j in range(6):
                    days_ago = 2 + j * 12 + (i * 2)
                    distance = round(35 + (i * 7 + j * 5) % 60, 1)
                    trip_rows.append({
                        "id": str(uuid.uuid4()), "workspace_id": DEFAULT_WORKSPACE_ID, "vehicle_id": v["id"],
                        "driver_id": None, "occurred_at": datetime.now(timezone.utc) - timedelta(days=days_ago),
                        "distance_km": distance, "created_by": None,
                    })
            await execute_many(
                "insert into trip_logs (id, workspace_id, vehicle_id, driver_id, occurred_at, distance_km, "
                "created_by) values (:id, :workspace_id, :vehicle_id, :driver_id, :occurred_at, :distance_km, :created_by)",
                trip_rows,
            )

    # Seed parts
    if not await fetch_one("select 1 from parts where workspace_id = :ws", ws=DEFAULT_WORKSPACE_ID):
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
        await execute_many(
            "insert into parts (id, workspace_id, name, sku, category, stock, reorder_point, unit_cost, "
            "supplier, supplier_email) values (:id, :workspace_id, :name, :sku, :category, :stock, "
            ":reorder_point, :unit_cost, :supplier, :supplier_email)",
            parts,
        )

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
    from db import engine as _pg_engine
    await _pg_engine.dispose()
