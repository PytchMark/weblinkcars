"use strict";

const { createSupabaseClient, createSupabaseServiceClient } = require("../../services/supabase");
const { jsonResponse, parseJsonBody } = require("./_helpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
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

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.session) {
    return jsonResponse(401, { ok: false, error: error?.message || "Login failed." });
  }

  const adminClient = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, dealer_id")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse(403, { ok: false, error: "Profile not found." });
  }

  if (profile.role !== "dealer") {
    return jsonResponse(403, { ok: false, error: "Not a dealer account." });
  }

  const { data: dealer } = await adminClient
    .from("dealers")
    .select("dealer_id, name, status, whatsapp, logo_url")
    .eq("dealer_id", profile.dealer_id)
    .single();

  return jsonResponse(200, {
    ok: true,
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      tokenType: data.session.token_type,
    },
    profile,
    dealer,
  });
};
