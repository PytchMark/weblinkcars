/**
 * Cloud Run (Express) server
 * - Serves static HTML apps from /apps
 * - Exposes API routes (public/dealer/admin) calling Airtable server-side
 * - Keeps all secrets in env vars (never in frontend)
 */

"use strict";

require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const app = express();

/** ========= Config ========= */
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || "development";

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const T_VEHICLES = process.env.AIRTABLE_TABLE_ID_VEHICLES;
const T_DEALERS = process.env.AIRTABLE_TABLE_ID_DEALERS;
const T_REQUESTS = process.env.AIRTABLE_TABLE_ID_VIEWING_REQUESTS;

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in env.");
}
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error("Missing AIRTABLE_API_KEY (or AIRTABLE_TOKEN) or AIRTABLE_BASE_ID in env.");
}
if (!T_VEHICLES || !T_DEALERS || !T_REQUESTS) {
  throw new Error("Missing one or more Airtable table ID env vars (AIRTABLE_TABLE_ID_*).");
}

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** ========= Middleware ========= */
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: CORS_ORIGINS.length ? CORS_ORIGINS : true,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

/** ========= Static apps ========= */
const APPS_DIR = path.join(__dirname, "apps");

app.use("/storefront", express.static(path.join(APPS_DIR, "storefront")));
app.use("/dealer", express.static(path.join(APPS_DIR, "dealer")));
app.use("/admin", express.static(path.join(APPS_DIR, "admin")));

/** Root */
app.get("/", (_req, res) => res.redirect("/storefront"));

/** ========= Helpers ========= */
const API_ROOT = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

function cleanStr(v, max = 500) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function isValidDealerId(dealerId) {
  return /^[a-zA-Z0-9_-]{3,40}$/.test(dealerId);
}

function normalizePhone(phone) {
  return cleanStr(phone, 40).replace(/[^\d+]/g, "");
}

function mapRequestTypeToEnum(type) {
  const t = cleanStr(type, 40).toLowerCase();

  if (t === "whatsapp" || t === "wa" || t === "chat") return "whatsapp";
  if (t === "live_video" || t === "live video" || t === "video" || t === "live") return "live_video";
  if (t === "walk_in" || t === "walk-in" || t === "in_store" || t === "in-store" || t === "in person") return "walk_in";

  return null;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  const s = String(value || "").toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}

function normalizeVehicleStatus(value) {
  const s = cleanStr(value, 40).toLowerCase();
  if (s === "available") return "available";
  if (s === "pending") return "pending";
  if (s === "sold") return "sold";
  if (s === "archived") return "archived";
  return "";
}

function normalizeRequestStatus(value) {
  const s = cleanStr(value, 40).toLowerCase();
  if (s === "new") return "New";
  if (s === "contacted") return "Contacted";
  if (s === "booked") return "Booked";
  if (s === "closed") return "Closed";
  if (s === "no show" || s === "noshow" || s === "no_show") return "No Show";
  return null;
}

function isPausedDealer(dealer) {
  const status = cleanStr(dealer?.status, 30).toLowerCase();
  return status === "paused";
}

function generatePasscode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** ========= Auth helpers ========= */
function hashPasscode(passcode, iterations = 120000) {
  if (!passcode || typeof passcode !== "string") {
    throw new Error("Passcode is required");
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(passcode, salt, iterations, 32, "sha256");
  return `pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPasscode(passcode, stored) {
  if (!passcode || typeof passcode !== "string") return false;
  if (!stored || typeof stored !== "string") return false;

  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  const salt = Buffer.from(parts[2], "base64");
  const hashExpected = Buffer.from(parts[3], "base64");

  const hash = crypto.pbkdf2Sync(passcode, salt, iterations, 32, "sha256");
  return crypto.timingSafeEqual(hash, hashExpected);
}

function signToken(payload, expiresIn = "12h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch (_err) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

function requireDealer(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "dealer") {
      return res.status(403).json({ ok: false, error: "Dealer access required" });
    }
    next();
  });
}

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (ADMIN_API_KEY && key && key === ADMIN_API_KEY) return next();

  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Admin access required" });
    }
    next();
  });
}

/** ========= Airtable helpers ========= */
function headers() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function tableUrl(tableId) {
  return `${API_ROOT}/${encodeURIComponent(tableId)}`;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function airtableFetch(url, opts = {}, attempt = 0) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });

  if (res.status === 429 && attempt < 3) {
    await sleep(800 + attempt * 600);
    return airtableFetch(url, opts, attempt + 1);
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg = typeof body === "object" ? JSON.stringify(body) : String(body);
    throw new Error(`Airtable error ${res.status}: ${msg}`);
  }

  return body;
}

function formulaEquals(field, value) {
  const safe = String(value).replace(/'/g, "\\'");
  return `{${field}}='${safe}'`;
}

function formulaAnd(...parts) {
  return `AND(${parts.join(",")})`;
}

async function listAllRecords(tableId, { filterByFormula, pageSize = 100 } = {}) {
  const records = [];
  let offset;

  const u = new URL(tableUrl(tableId));
  u.searchParams.set("pageSize", String(pageSize));
  if (filterByFormula) u.searchParams.set("filterByFormula", filterByFormula);

  do {
    if (offset) u.searchParams.set("offset", offset);
    const data = await airtableFetch(u.toString(), { method: "GET" });
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records.map((r) => ({ airtableRecordId: r.id, ...r.fields }));
}

async function getDealerByDealerId(dealerId) {
  const u = new URL(tableUrl(T_DEALERS));
  u.searchParams.set("maxRecords", "1");
  u.searchParams.set("filterByFormula", formulaEquals("dealerId", dealerId));

  const data = await airtableFetch(u.toString(), { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;

  return {
    airtableRecordId: rec.id,
    ...rec.fields,
  };
}

async function listDealers({ status } = {}) {
  let filter;
  if (status) {
    filter = formulaEquals("status", status);
  }
  return listAllRecords(T_DEALERS, { filterByFormula: filter });
}

async function createDealer(fields) {
  const url = tableUrl(T_DEALERS);
  const payload = { records: [{ fields }] };
  const data = await airtableFetch(url, { method: "POST", body: JSON.stringify(payload) });
  const rec = data?.records?.[0];
  return rec ? { airtableRecordId: rec.id, ...rec.fields } : null;
}

async function updateDealerByRecordId(recordId, fields) {
  const url = `${tableUrl(T_DEALERS)}/${recordId}`;
  const data = await airtableFetch(url, { method: "PATCH", body: JSON.stringify({ fields }) });
  return data ? { airtableRecordId: data.id, ...data.fields } : null;
}

async function updateDealerByDealerId(dealerId, fields) {
  const existing = await getDealerByDealerId(dealerId);
  if (!existing?.airtableRecordId) return null;
  return updateDealerByRecordId(existing.airtableRecordId, fields);
}

async function upsertDealerByDealerId(dealerId, fields) {
  const existing = await getDealerByDealerId(dealerId);
  if (existing?.airtableRecordId) return updateDealerByRecordId(existing.airtableRecordId, fields);
  return createDealer(fields);
}

async function getVehiclesForDealer(dealerId, { includeArchived = false, publicOnly = false } = {}) {
  const u = new URL(tableUrl(T_VEHICLES));
  u.searchParams.set("pageSize", "100");

  const parts = [formulaEquals("dealerId", dealerId)];

  if (!includeArchived) {
    parts.push("{archived}!=TRUE()");
  }

  if (publicOnly) {
    parts.push("{Availability}=TRUE()");
  }

  u.searchParams.set("filterByFormula", formulaAnd(...parts));

  const records = [];
  let offset;

  do {
    if (offset) u.searchParams.set("offset", offset);
    const data = await airtableFetch(u.toString(), { method: "GET" });
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records.map((r) => ({ airtableRecordId: r.id, ...r.fields }));
}

async function getVehicleByVehicleId(vehicleId) {
  const u = new URL(tableUrl(T_VEHICLES));
  u.searchParams.set("maxRecords", "1");
  u.searchParams.set("filterByFormula", formulaEquals("vehicleId", vehicleId));

  const data = await airtableFetch(u.toString(), { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;

  return { airtableRecordId: rec.id, ...rec.fields };
}

async function createVehicle(fields) {
  const url = tableUrl(T_VEHICLES);
  const payload = { records: [{ fields }] };
  const data = await airtableFetch(url, { method: "POST", body: JSON.stringify(payload) });
  const rec = data?.records?.[0];
  return rec ? { airtableRecordId: rec.id, ...rec.fields } : null;
}

async function updateVehicleByRecordId(recordId, fields) {
  const url = `${tableUrl(T_VEHICLES)}/${recordId}`;
  const data = await airtableFetch(url, { method: "PATCH", body: JSON.stringify({ fields }) });
  return data ? { airtableRecordId: data.id, ...data.fields } : null;
}

async function upsertVehicleByVehicleId(vehicleId, fields) {
  const existing = await getVehicleByVehicleId(vehicleId);
  if (existing?.airtableRecordId) return updateVehicleByRecordId(existing.airtableRecordId, fields);
  return createVehicle(fields);
}

async function archiveVehicle(vehicleId) {
  const existing = await getVehicleByVehicleId(vehicleId);
  if (!existing?.airtableRecordId) return null;

  return updateVehicleByRecordId(existing.airtableRecordId, {
    archived: true,
    status: "archived",
  });
}

async function listVehicles({ dealerId, status } = {}) {
  const parts = [];
  if (dealerId) parts.push(formulaEquals("dealerId", dealerId));
  if (status) parts.push(formulaEquals("status", status));
  const filterByFormula = parts.length ? formulaAnd(...parts) : undefined;
  return listAllRecords(T_VEHICLES, { filterByFormula });
}

async function createViewingRequest(fields) {
  const url = tableUrl(T_REQUESTS);
  const payload = { records: [{ fields }] };
  const data = await airtableFetch(url, { method: "POST", body: JSON.stringify(payload) });
  const rec = data?.records?.[0];
  return rec ? { airtableRecordId: rec.id, ...rec.fields } : null;
}

async function getViewingRequestsForDealer(dealerId) {
  const filter = formulaEquals("dealerId", dealerId);
  return listAllRecords(T_REQUESTS, { filterByFormula: filter });
}

async function listViewingRequests({ dealerId, status } = {}) {
  const parts = [];
  if (dealerId) parts.push(formulaEquals("dealerId", dealerId));
  if (status) parts.push(formulaEquals("status", status));
  const filterByFormula = parts.length ? formulaAnd(...parts) : undefined;
  return listAllRecords(T_REQUESTS, { filterByFormula });
}

async function getViewingRequestByRequestId(requestId) {
  const u = new URL(tableUrl(T_REQUESTS));
  u.searchParams.set("maxRecords", "1");
  u.searchParams.set("filterByFormula", formulaEquals("requestId", requestId));

  const data = await airtableFetch(u.toString(), { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;
  return { airtableRecordId: rec.id, ...rec.fields };
}

async function updateViewingRequestByRecordId(recordId, fields) {
  const url = `${tableUrl(T_REQUESTS)}/${recordId}`;
  const data = await airtableFetch(url, { method: "PATCH", body: JSON.stringify({ fields }) });
  return data ? { airtableRecordId: data.id, ...data.fields } : null;
}

async function updateViewingRequestByRequestId(requestId, fields) {
  const existing = await getViewingRequestByRequestId(requestId);
  if (!existing?.airtableRecordId) return null;
  return updateViewingRequestByRecordId(existing.airtableRecordId, fields);
}

/** ========= Analytics helpers ========= */
function parseMonth(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

async function getDealerInventoryKpis(dealerId) {
  const filter = formulaEquals("dealerId", dealerId);
  const vehicles = await listAllRecords(T_VEHICLES, { filterByFormula: filter });

  const out = {
    total: vehicles.length,
    byStatus: {
      available: 0,
      pending: 0,
      sold: 0,
      archived: 0,
      other: 0,
    },
    archivedChecked: 0,
    liveAvailable: 0,
    totalValueJmd: 0,
  };

  for (const v of vehicles) {
    const status = String(v.status || "").toLowerCase();
    if (status && out.byStatus[status] !== undefined) out.byStatus[status]++;
    else out.byStatus.other++;

    if (v.archived === true) out.archivedChecked++;
    if (v.Availability === true && v.archived !== true) out.liveAvailable++;

    const price = Number(v.Price || 0);
    if (Number.isFinite(price) && price > 0) out.totalValueJmd += price;
  }

  return out;
}

async function getDealerRequestKpis(dealerId, { month } = {}) {
  const monthDate = parseMonth(month);
  const filterParts = [formulaEquals("dealerId", dealerId)];

  if (monthDate) {
    const start = startOfMonth(monthDate).toISOString();
    const end = endOfMonth(monthDate).toISOString();
    filterParts.push(`IS_AFTER({createdAt}, '${start}')`);
    filterParts.push(`IS_BEFORE({createdAt}, '${end}')`);
  }

  const filter = formulaAnd(...filterParts);
  const requests = await listAllRecords(T_REQUESTS, { filterByFormula: filter });

  const out = {
    total: requests.length,
    byStatus: {},
    byType: {},
  };

  for (const r of requests) {
    const s = String(r.status || "unknown").toLowerCase();
    const t = String(r.type || "unknown").toLowerCase();

    out.byStatus[s] = (out.byStatus[s] || 0) + 1;
    out.byType[t] = (out.byType[t] || 0) + 1;
  }

  return out;
}

async function getDealerSalesKpis(dealerId, { month } = {}) {
  const monthDate = parseMonth(month);
  const parts = [formulaEquals("dealerId", dealerId), `{status}='sold'`];

  if (monthDate) {
    const start = startOfMonth(monthDate).toISOString();
    const end = endOfMonth(monthDate).toISOString();
    parts.push(`IS_AFTER({updatedAt}, '${start}')`);
    parts.push(`IS_BEFORE({updatedAt}, '${end}')`);
  }

  const filter = formulaAnd(...parts);
  const soldVehicles = await listAllRecords(T_VEHICLES, { filterByFormula: filter });

  let revenue = 0;
  for (const v of soldVehicles) {
    const price = Number(v.Price || 0);
    if (Number.isFinite(price) && price > 0) revenue += price;
  }

  return {
    soldCount: soldVehicles.length,
    revenueJmd: revenue,
  };
}

async function getDealerMetrics(dealerId, { month } = {}) {
  const [inventory, requests, sales] = await Promise.all([
    getDealerInventoryKpis(dealerId),
    getDealerRequestKpis(dealerId, { month }),
    getDealerSalesKpis(dealerId, { month }),
  ]);

  return {
    dealerId,
    month: month || null,
    inventory,
    requests,
    sales,
  };
}

async function getDealersSummary({ month } = {}) {
  const monthDate = parseMonth(month);

  const dealers = await listAllRecords(T_DEALERS);

  const [vehicles, requests] = await Promise.all([
    listAllRecords(T_VEHICLES),
    (async () => {
      if (!monthDate) return listAllRecords(T_REQUESTS);

      const start = startOfMonth(monthDate).toISOString();
      const end = endOfMonth(monthDate).toISOString();
      const requestFilter = formulaAnd(
        `IS_AFTER({createdAt}, '${start}')`,
        `IS_BEFORE({createdAt}, '${end}')`
      );
      return listAllRecords(T_REQUESTS, { filterByFormula: requestFilter });
    })(),
  ]);

  const vehiclesByDealer = new Map();
  for (const v of vehicles) {
    const d = String(v.dealerId || "");
    if (!d) continue;
    if (!vehiclesByDealer.has(d)) vehiclesByDealer.set(d, []);
    vehiclesByDealer.get(d).push(v);
  }

  const requestsByDealer = new Map();
  for (const r of requests) {
    const d = String(r.dealerId || "");
    if (!d) continue;
    if (!requestsByDealer.has(d)) requestsByDealer.set(d, []);
    requestsByDealer.get(d).push(r);
  }

  const rows = dealers.map((d) => {
    const dealerId = String(d.dealerId || "");
    const dealerVehicles = vehiclesByDealer.get(dealerId) || [];
    const dealerRequests = requestsByDealer.get(dealerId) || [];

    const byStatus = { available: 0, pending: 0, sold: 0, archived: 0, other: 0 };
    let liveAvailable = 0;
    let archivedChecked = 0;

    for (const v of dealerVehicles) {
      const s = String(v.status || "other").toLowerCase();
      if (byStatus[s] !== undefined) byStatus[s]++;
      else byStatus.other++;

      if (v.archived === true) archivedChecked++;
      if (v.Availability === true && v.archived !== true) liveAvailable++;
    }

    const reqByStatus = {};
    const reqByType = {};
    for (const r of dealerRequests) {
      const rs = String(r.status || "unknown").toLowerCase();
      const rt = String(r.type || "unknown").toLowerCase();
      reqByStatus[rs] = (reqByStatus[rs] || 0) + 1;
      reqByType[rt] = (reqByType[rt] || 0) + 1;
    }

    return {
      dealerId,
      name: d.name || "",
      status: d.status || "",
      whatsapp: d.whatsapp || "",
      logoUrl: d.logoUrl || "",
      inventory: {
        total: dealerVehicles.length,
        liveAvailable,
        archivedChecked,
        byStatus,
      },
      requests: {
        month: month || null,
        total: dealerRequests.length,
        byStatus: reqByStatus,
        byType: reqByType,
      },
    };
  });

  rows.sort((a, b) => {
    const aActive = String(a.status).toLowerCase() === "active" ? 0 : 1;
    const bActive = String(b.status).toLowerCase() === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (b.requests.total || 0) - (a.requests.total || 0);
  });

  return { month: month || null, dealers: rows };
}

/** ========= Health ========= */
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "carsales-platform",
    env: NODE_ENV,
    time: new Date().toISOString(),
  });
});

/** ========= API index ========= */
app.get("/api", (_req, res) => {
  res.json({
    ok: true,
    message: "API online",
    routes: ["/api/public", "/api/dealer", "/api/admin"],
  });
});

/** ========= Public API ========= */
app.get("/api/public/dealer/:dealerId", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    return res.json({
      ok: true,
      dealer: {
        dealerId: dealer.dealerId,
        name: dealer.name || "",
        status: dealer.status || "",
        whatsapp: dealer.whatsapp || "",
        logoUrl: dealer.logoUrl || "",
      },
    });
  } catch (err) {
    console.error("GET /api/public/dealer/:dealerId error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/public/dealer/:dealerId/vehicles", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const all = cleanStr(req.query.all, 10) === "1";

    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    const vehicles = await getVehiclesForDealer(dealerId, {
      includeArchived: false,
      publicOnly: !all,
    });

    return res.json({
      ok: true,
      dealer: {
        dealerId: dealer.dealerId,
        name: dealer.name || "",
        logoUrl: dealer.logoUrl || "",
      },
      vehicles,
    });
  } catch (err) {
    console.error("GET /api/public/dealer/:dealerId/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/public/dealer/:dealerId/requests", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const typeEnum = mapRequestTypeToEnum(req.body.requestType);
    if (!typeEnum) {
      return res.status(400).json({
        ok: false,
        error: "Invalid requestType. Use whatsapp, live_video, or walk_in.",
      });
    }

    const name = cleanStr(req.body.customerName, 120);
    const phone = normalizePhone(req.body.phone);
    const email = cleanStr(req.body.email, 120);
    const preferredDate = cleanStr(req.body.preferredDate, 40);
    const preferredTime = cleanStr(req.body.preferredTime, 60);
    const notes = cleanStr(req.body.notes, 1200);
    const vehicleId = cleanStr(req.body.vehicleId, 60);

    if (!name) return res.status(400).json({ ok: false, error: "customerName is required" });
    if (!phone || phone.length < 7) return res.status(400).json({ ok: false, error: "phone is required" });

    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    let safeVehicleId = "";
    if (vehicleId) {
      const v = await getVehicleByVehicleId(vehicleId);
      if (v && cleanStr(v.dealerId, 60) === dealerId) {
        safeVehicleId = vehicleId;
      }
    }

    const fields = {
      dealerId,
      type: typeEnum,
      status: "New",
      name,
      phone,
      source: "storefront",
    };

    if (safeVehicleId) fields.vehicleId = safeVehicleId;
    if (email) fields.email = email;
    if (preferredDate) fields.preferredDate = preferredDate;
    if (preferredTime) fields.preferredTime = preferredTime;
    if (notes) fields.notes = notes;

    const created = await createViewingRequest(fields);

    return res.status(201).json({
      ok: true,
      request: created,
    });
  } catch (err) {
    console.error("POST /api/public/dealer/:dealerId/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** ========= Dealer API ========= */
app.post("/api/dealer/login", async (req, res) => {
  try {
    const dealerId = cleanStr(req.body.dealerId, 60);
    const passcode = cleanStr(req.body.passcode, 120);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }
    if (!passcode) {
      return res.status(400).json({ ok: false, error: "passcode is required" });
    }

    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(401).json({ ok: false, error: "Dealer not found" });

    const storedHash = dealer.passcodeHash;
    if (!storedHash) return res.status(401).json({ ok: false, error: "Dealer passcode not set" });

    const valid = verifyPasscode(passcode, storedHash);
    if (!valid) return res.status(401).json({ ok: false, error: "Invalid passcode" });

    const token = signToken({ role: "dealer", dealerId });

    return res.json({
      ok: true,
      token,
      dealer: {
        dealerId: dealer.dealerId || dealerId,
        name: dealer.name || "",
        status: dealer.status || "",
        whatsapp: dealer.whatsapp || "",
        email: dealer.email || "",
        logoUrl: dealer.logoUrl || "",
      },
    });
  } catch (err) {
    console.error("POST /api/dealer/login error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/me", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    return res.json({
      ok: true,
      dealer: {
        dealerId: dealer.dealerId || dealerId,
        name: dealer.name || "",
        status: dealer.status || "",
        whatsapp: dealer.whatsapp || "",
        email: dealer.email || "",
        logoUrl: dealer.logoUrl || "",
      },
    });
  } catch (err) {
    console.error("GET /api/dealer/me error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/vehicles", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const includeArchived = toBool(req.query.includeArchived);

    const vehicles = await getVehiclesForDealer(dealerId, {
      includeArchived: includeArchived !== undefined ? includeArchived : true,
      publicOnly: false,
    });

    return res.json({ ok: true, vehicles });
  } catch (err) {
    console.error("GET /api/dealer/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/dealer/vehicles", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const vehicleId = cleanStr(req.body.vehicleId, 60);

    if (!vehicleId) {
      return res.status(400).json({ ok: false, error: "vehicleId is required" });
    }

    const fields = {
      ...req.body,
      dealerId,
      vehicleId,
    };

    const vehicle = await upsertVehicleByVehicleId(vehicleId, fields);
    if (!vehicle) {
      return res.status(500).json({ ok: false, error: "Failed to save vehicle" });
    }

    return res.json({ ok: true, vehicle });
  } catch (err) {
    console.error("POST /api/dealer/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/dealer/vehicles/:vehicleId/archive", requireDealer, async (req, res) => {
  try {
    const vehicleId = cleanStr(req.params.vehicleId, 60);
    if (!vehicleId) {
      return res.status(400).json({ ok: false, error: "vehicleId is required" });
    }

    const updated = await archiveVehicle(vehicleId);
    if (!updated) return res.status(404).json({ ok: false, error: "Vehicle not found" });

    return res.json({ ok: true, vehicle: updated });
  } catch (err) {
    console.error("POST /api/dealer/vehicles/:vehicleId/archive error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/requests", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const requests = await getViewingRequestsForDealer(dealerId);
    return res.json({ ok: true, requests });
  } catch (err) {
    console.error("GET /api/dealer/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/dealer/requests/:requestId/status", requireDealer, async (req, res) => {
  try {
    const requestId = cleanStr(req.params.requestId, 80);
    const status = normalizeRequestStatus(req.body.status);

    if (!requestId) {
      return res.status(400).json({ ok: false, error: "requestId is required" });
    }

    if (!status) {
      return res.status(400).json({ ok: false, error: "Invalid status" });
    }

    const updated = await updateViewingRequestByRequestId(requestId, { status });
    if (!updated) return res.status(404).json({ ok: false, error: "Request not found" });

    return res.json({ ok: true, request: updated });
  } catch (err) {
    console.error("POST /api/dealer/requests/:requestId/status error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/summary", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const month = cleanStr(req.query.month, 20);

    const kpis = await getDealerMetrics(dealerId, { month: month || undefined });

    return res.json({
      ok: true,
      kpis,
      dailyRequests: [],
    });
  } catch (err) {
    console.error("GET /api/dealer/summary error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** ========= Admin API ========= */
app.post("/api/admin/login", async (req, res) => {
  try {
    const username = cleanStr(req.body.username, 120);
    const password = cleanStr(req.body.password, 200);

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      return res.status(500).json({ ok: false, error: "Admin credentials not configured" });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const token = signToken({ role: "admin", username });
    return res.json({ ok: true, token });
  } catch (err) {
    console.error("POST /api/admin/login error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/admin/dealers", requireAdmin, async (req, res) => {
  try {
    const status = cleanStr(req.query.status, 30).toLowerCase();
    const dealers = await listDealers(status ? { status } : {});
    return res.json({ ok: true, dealers });
  } catch (err) {
    console.error("GET /api/admin/dealers error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/admin/dealers", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.body.dealerId, 60);
    const name = cleanStr(req.body.name, 120);
    const status = cleanStr(req.body.status, 40).toLowerCase() || "active";
    const whatsapp = cleanStr(req.body.whatsapp, 40);
    const logoUrl = cleanStr(req.body.logoUrl, 500);

    if (!dealerId || !name) {
      return res.status(400).json({ ok: false, error: "dealerId and name are required" });
    }
    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    let passcode = cleanStr(req.body.passcode, 120);
    const fields = {
      dealerId,
      name,
      status,
      whatsapp,
      logoUrl,
    };

    const existing = await getDealerByDealerId(dealerId);
    if (!existing && !passcode) {
      passcode = generatePasscode();
    }

    if (passcode) {
      fields.passcodeHash = hashPasscode(passcode);
    }

    const dealer = existing
      ? await updateDealerByDealerId(dealerId, fields)
      : await upsertDealerByDealerId(dealerId, fields);

    if (!dealer) {
      return res.status(500).json({ ok: false, error: "Failed to save dealer" });
    }

    return res.json({ ok: true, dealer, passcode });
  } catch (err) {
    console.error("POST /api/admin/dealers error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/admin/reset-passcode", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.body.dealerId, 60);
    if (!dealerId || !isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const passcode = generatePasscode();
    const dealer = await updateDealerByDealerId(dealerId, {
      passcodeHash: hashPasscode(passcode),
    });

    if (!dealer) {
      return res.status(404).json({ ok: false, error: "Dealer not found" });
    }

    return res.json({ ok: true, dealer, passcode });
  } catch (err) {
    console.error("POST /api/admin/reset-passcode error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/admin/inventory", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.query.dealerId, 60);
    const status = normalizeVehicleStatus(req.query.status);
    const vehicles = await listVehicles({ dealerId, status });
    return res.json({ ok: true, vehicles });
  } catch (err) {
    console.error("GET /api/admin/inventory error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/admin/requests", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.query.dealerId, 60);
    const status = normalizeRequestStatus(req.query.status) || "";
    const requests = await listViewingRequests({ dealerId, status });
    return res.json({ ok: true, requests });
  } catch (err) {
    console.error("GET /api/admin/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/admin/dealers/summary", requireAdmin, async (req, res) => {
  try {
    const month = cleanStr(req.query.month, 20);
    const summaryRaw = await getDealersSummary({ month: month || undefined });

    const dealers = (summaryRaw.dealers || []).map((d) => ({
      dealerId: d.dealerId,
      name: d.name || "",
      status: d.status || "",
      inventory: d.inventory?.total || 0,
      available: d.inventory?.byStatus?.available || 0,
      requests: d.requests?.total || 0,
      new: d.requests?.byStatus?.new || 0,
      booked: d.requests?.byStatus?.booked || 0,
    }));

    const totals = {
      dealers: dealers.length,
      activeDealers: dealers.filter((d) => String(d.status).toLowerCase() === "active").length,
      availableVehicles: dealers.reduce((sum, d) => sum + Number(d.available || 0), 0),
      requests: dealers.reduce((sum, d) => sum + Number(d.requests || 0), 0),
    };

    return res.json({
      ok: true,
      summary: {
        month: summaryRaw.month || null,
        totals,
        dealers,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/dealers/summary error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** ========= 404 ========= */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

/** ========= Error handler ========= */
app.use((err, _req, res, _next) => {
  console.error("Server Error:", err);
  res.status(500).json({ ok: false, error: "Internal Server Error" });
});

/** ========= Start ========= */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
