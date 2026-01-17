"use strict";

const jwt = require("jsonwebtoken");
const { jsonResponse, parseJsonBody } = require("./_helpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  if (!event.body) {
    return jsonResponse(400, { ok: false, error: "Missing request body." });
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

  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
  if (!adminEmail || !adminPassword) {
    return jsonResponse(500, { ok: false, error: "Admin credentials not configured." });
  }

  if (email !== adminEmail || password !== adminPassword) {
    return jsonResponse(403, { ok: false, error: "Invalid credentials" });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return jsonResponse(500, { ok: false, error: "JWT secret not configured." });
  }

  const token = jwt.sign({ role: "admin", email }, secret, { expiresIn: "12h" });

  return jsonResponse(200, {
    ok: true,
    role: "admin",
    session: {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 60 * 60 * 12,
    },
  });
};
