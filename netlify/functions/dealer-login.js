"use strict";

const jwt = require("jsonwebtoken");
const { createSupabaseServiceClient } = require("../../services/supabase");
const { jsonResponse, parseJsonBody, isValidDealerId } = require("./_helpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  const payload = parseJsonBody(event);
  if (payload === null) {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
  }

  const dealerId = String(payload.dealerId || payload.dealer_id || "").trim();
  const password = String(payload.password || "").trim();

  if (!isValidDealerId(dealerId)) {
    return jsonResponse(400, { ok: false, error: "Dealer ID is required." });
  }

  if (!password) {
    return jsonResponse(400, { ok: false, error: "Password is required." });
  }

  const adminClient = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select('id, role, dealer_id, profile_email, "Password"')
    .eq("dealer_id", dealerId)
    .single();

  if (profileError || !profile) {
    return jsonResponse(403, { ok: false, error: "Dealer profile not found." });
  }

  if (profile.role !== "dealer") {
    return jsonResponse(403, { ok: false, error: "Not a dealer account." });
  }

  if (!profile.Password || profile.Password !== password) {
    return jsonResponse(401, { ok: false, error: "Invalid dealer credentials." });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return jsonResponse(500, { ok: false, error: "JWT secret not configured." });
  }

  const token = jwt.sign(
    { role: "dealer", dealerId: profile.dealer_id, profileId: profile.id },
    secret,
    { expiresIn: "12h" }
  );

  const { data: dealer } = await adminClient
    .from("dealers")
    .select("dealer_id, name, status, whatsapp, logo_url")
    .eq("dealer_id", profile.dealer_id)
    .single();

  const safeProfile = {
    id: profile.id,
    role: profile.role,
    dealer_id: profile.dealer_id,
    profile_email: profile.profile_email || null,
  };

  return jsonResponse(200, {
    ok: true,
    session: {
      accessToken: token,
      tokenType: "bearer",
      expiresIn: 60 * 60 * 12,
    },
    profile: safeProfile,
    dealer,
  });
};
