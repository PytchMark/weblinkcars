"use strict";

const { createSupabaseServiceClient } = require("../../services/supabase");

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function parseJsonBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (_err) {
    return null;
  }
}

function getBearerToken(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

async function requireAuth(event, allowedRoles = []) {
  const token = getBearerToken(event);
  if (!token) {
    return { error: jsonResponse(401, { ok: false, error: "Missing authorization token." }) };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { error: jsonResponse(401, { ok: false, error: "Invalid or expired token." }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, dealer_id")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    return { error: jsonResponse(403, { ok: false, error: "Profile not found." }) };
  }

  if (allowedRoles.length && !allowedRoles.includes(profile.role)) {
    return { error: jsonResponse(403, { ok: false, error: "Insufficient permissions." }) };
  }

  return { supabase, user: data.user, profile };
}

function parseDealerIdFromPath(event) {
  const path = event.path || "";
  const parts = path.split("/").filter(Boolean);
  const dealerIndex = parts.indexOf("dealer");
  if (dealerIndex === -1 || !parts[dealerIndex + 1]) return "";
  return decodeURIComponent(parts[dealerIndex + 1]);
}

function normalizeDealerIdInput(value) {
  const clean = String(value || "").trim();
  return clean;
}

function normalizeDealerIdsInput(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => normalizeDealerIdInput(v)).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => normalizeDealerIdInput(v))
    .filter(Boolean);
}

function isValidDealerId(value) {
  return /^[a-zA-Z0-9_-]{3,40}$/.test(String(value || "").trim());
}

module.exports = {
  jsonResponse,
  parseJsonBody,
  requireAuth,
  parseDealerIdFromPath,
  normalizeDealerIdInput,
  normalizeDealerIdsInput,
  isValidDealerId,
};
