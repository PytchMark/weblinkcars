"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { jsonResponse, parseJsonBody } = require("./_helpers");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const JWT_SECRET = process.env.JWT_SECRET || "";

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  console.info("admin-login env", {
    hasAdminEmail: Boolean(ADMIN_EMAIL),
    hasAdminPassword: Boolean(ADMIN_PASSWORD),
    hasJwtSecret: Boolean(JWT_SECRET),
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) {
    return jsonResponse(500, { ok: false, error: "Admin credentials are not configured." });
  }

  const payload = parseJsonBody(event);
  if (payload === null) {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "").trim();

  if (!email || !password) {
    return jsonResponse(400, { ok: false, error: "Email and password are required." });
  }

  if (!timingSafeEqual(email, ADMIN_EMAIL.toLowerCase()) || !timingSafeEqual(password, ADMIN_PASSWORD)) {
    return jsonResponse(401, { ok: false, error: "Invalid admin credentials." });
  }

  const token = jwt.sign({ role: "admin", email: ADMIN_EMAIL.toLowerCase() }, JWT_SECRET, { expiresIn: "12h" });
  return jsonResponse(200, {
    ok: true,
    token,
  });
};
