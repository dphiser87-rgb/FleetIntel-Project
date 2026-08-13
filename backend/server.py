from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Mongo ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# --- JWT helpers ---
JWT_ALGO = "HS256"
def jwt_secret(): return os.environ["JWT_SECRET"]

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
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": req.name,
        "role": req.role,
        "password_hash": hash_pw(req.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], user["email"], user["role"])
    user.pop("password_hash", None)
    user.pop("_id", None)
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
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users

# --- Vehicles ---
@api.get("/vehicles")
async def list_vehicles(user: dict = Depends(get_current_user)):
    return await db.vehicles.find({}, {"_id": 0}).to_list(1000)

@api.post("/vehicles")
async def create_vehicle(v: VehicleIn, user: dict = Depends(get_current_user)):
    doc = v.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.vehicles.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/vehicles/{vid}")
async def get_vehicle(vid: str, user: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    if not v: raise HTTPException(status_code=404, detail="Not found")
    return v

@api.patch("/vehicles/{vid}")
async def update_vehicle(vid: str, patch: dict, user: dict = Depends(get_current_user)):
    patch.pop("id", None); patch.pop("_id", None)
    await db.vehicles.update_one({"id": vid}, {"$set": patch})
    return await db.vehicles.find_one({"id": vid}, {"_id": 0})

@api.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user: dict = Depends(get_current_user)):
    await db.vehicles.delete_one({"id": vid})
    return {"ok": True}

# --- Templates ---
@api.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    return await db.templates.find({}, {"_id": 0}).to_list(200)

@api.post("/templates")
async def create_template(t: TemplateIn, user: dict = Depends(get_current_user)):
    doc = t.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_by"] = user["id"]
    doc["created_at"] = now_iso()
    await db.templates.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/templates/{tid}")
async def get_template(tid: str, user: dict = Depends(get_current_user)):
    t = await db.templates.find_one({"id": tid}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Not found")
    return t

@api.patch("/templates/{tid}")
async def update_template(tid: str, patch: dict, user: dict = Depends(get_current_user)):
    patch.pop("id", None); patch.pop("_id", None)
    await db.templates.update_one({"id": tid}, {"$set": patch})
    return await db.templates.find_one({"id": tid}, {"_id": 0})

@api.delete("/templates/{tid}")
async def delete_template(tid: str, user: dict = Depends(get_current_user)):
    await db.templates.delete_one({"id": tid})
    return {"ok": True}

# --- Inspections ---
@api.get("/inspections")
async def list_inspections(vehicle_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"vehicle_id": vehicle_id} if vehicle_id else {}
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
    return await db.maintenance.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.post("/maintenance")
async def create_maintenance(m: MaintenanceIn, user: dict = Depends(get_current_user)):
    doc = m.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["status"] = "pending"
    doc["created_by"] = user["id"]
    doc["created_at"] = now_iso()
    doc["actual_cost"] = 0
    doc["downtime_hours"] = 0
    await db.maintenance.insert_one(doc)
    # set vehicle to maintenance
    await db.vehicles.update_one({"id": doc["vehicle_id"]}, {"$set": {"status": "maintenance"}})
    doc.pop("_id", None)
    return doc

@api.patch("/maintenance/{mid}")
async def update_maintenance(mid: str, patch: MaintenanceUpdate, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in patch.model_dump().items() if v is not None}
    job = await db.maintenance.find_one({"id": mid})
    if not job: raise HTTPException(status_code=404, detail="Not found")
    if upd.get("status") == "completed":
        upd["completed_at"] = now_iso()
        pc = upd.get("parts_cost", job.get("parts_cost", 0))
        lc = upd.get("labor_cost", job.get("labor_cost", 0))
        upd["actual_cost"] = upd.get("actual_cost") or (pc + lc)
        # restore vehicle to active
        await db.vehicles.update_one({"id": job["vehicle_id"]}, {"$set": {"status": "active"}})
    if upd.get("status") == "in_progress":
        upd["started_at"] = now_iso()
    await db.maintenance.update_one({"id": mid}, {"$set": upd})
    return await db.maintenance.find_one({"id": mid}, {"_id": 0})

@api.delete("/maintenance/{mid}")
async def delete_maintenance(mid: str, user: dict = Depends(get_current_user)):
    await db.maintenance.delete_one({"id": mid})
    return {"ok": True}

# --- KPIs / Analytics ---
@api.get("/analytics/kpi")
async def analytics_kpi(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find({}, {"_id": 0}).to_list(1000)
    maint = await db.maintenance.find({}, {"_id": 0}).to_list(2000)
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
    maint = await db.maintenance.find({"status": "completed"}, {"_id": 0}).to_list(2000)
    total_parts = sum(m.get("parts_cost", 0) or 0 for m in maint)
    total_labor = sum(m.get("labor_cost", 0) or 0 for m in maint)
    vehicles = await db.vehicles.find({}, {"_id": 0}).to_list(1000)
    total_fuel = sum((v.get("odometer", 0) or 0) * (v.get("fuel_cost_per_km", 0) or 0) for v in vehicles)
    return [
        {"name": "Parts", "value": round(total_parts, 2)},
        {"name": "Labor", "value": round(total_labor, 2)},
        {"name": "Fuel", "value": round(total_fuel, 2)},
    ]

@api.get("/analytics/vehicle-cost")
async def vehicle_cost(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find({}, {"_id": 0}).to_list(1000)
    maint = await db.maintenance.find({"status": "completed"}, {"_id": 0}).to_list(2000)
    result = []
    for v in vehicles:
        cost = sum(m.get("actual_cost", 0) or 0 for m in maint if m.get("vehicle_id") == v["id"])
        result.append({"vehicle": v["name"], "plate": v["plate"], "cost": round(cost, 2)})
    return sorted(result, key=lambda x: x["cost"], reverse=True)

# --- Seed ---
async def seed():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email, "name": "Fleet Owner",
            "role": "admin", "password_hash": hash_pw(admin_password), "created_at": now_iso(),
        })
        logger.info(f"Seeded admin: {admin_email}")
    elif not verify_pw(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_pw(admin_password)}})

    # Test users
    for email, name, role, pw in [
        ("manager@fleet.com", "Marcus Chen", "manager", "manager123"),
        ("inspector@fleet.com", "Sara Ortiz", "inspector", "inspector123"),
        ("mechanic@fleet.com", "Dan Fields", "mechanic", "mechanic123"),
    ]:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "email": email, "name": name,
                "role": role, "password_hash": hash_pw(pw), "created_at": now_iso(),
            })

    # Vehicles
    if await db.vehicles.count_documents({}) == 0:
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
            v["created_at"] = now_iso()
        await db.vehicles.insert_many(vs)

    # Default template
    if await db.templates.count_documents({}) == 0:
        template = {
            "id": str(uuid.uuid4()),
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
    if await db.maintenance.count_documents({}) == 0:
        vehicles = await db.vehicles.find({}, {"_id": 0}).to_list(100)
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

    await db.users.create_index("email", unique=True)
    await db.vehicles.create_index("id")
    await db.templates.create_index("id")
    await db.inspections.create_index("id")
    await db.maintenance.create_index("id")

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
