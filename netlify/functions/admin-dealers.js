"use strict";

const { createSupabaseServiceClient } = require("../../services/supabase");
const { jsonResponse, parseJsonBody, requireAdmin } = require("./_helpers");

function parseDealerIdFromPath(path) {
  const parts = (path || "").split("/").filter(Boolean);
  const idx = parts.indexOf("dealers");
  if (idx === -1) return "";
  return decodeURIComponent(parts[idx + 1] || "");
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;

  const supabase = createSupabaseServiceClient();

  if (event.httpMethod === "GET") {
    const { data, error } = await supabase
      .from("dealers")
      .select("dealer_id, name, status, whatsapp, logo_url, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to load dealers." });
    }

    return jsonResponse(200, { ok: true, dealers: data || [] });
  }

  if (event.httpMethod === "POST") {
    const body = parseJsonBody(event);
    if (body === null) {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
    }

    const dealerId = String(body.dealer_id || body.dealerId || "").trim();
    const name = String(body.name || "").trim();
    const status = body.status || "active";
    const whatsapp = body.whatsapp || null;
    const logoUrl = body.logo_url || body.logoUrl || null;
    const email = body.email ? String(body.email).trim().toLowerCase() : "";
    const password = body.password ? String(body.password).trim() : "";

    if (!dealerId || !name) {
      return jsonResponse(400, { ok: false, error: "dealer_id and name are required." });
    }

    const { data: dealer, error: dealerError } = await supabase
      .from("dealers")
      .insert({
        dealer_id: dealerId,
        name,
        status,
        whatsapp,
        logo_url: logoUrl,
      })
      .select()
      .single();

    if (dealerError) {
      return jsonResponse(500, { ok: false, error: "Failed to create dealer." });
    }

    if (email && password) {
      const { data: userData, error: userError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (userError) {
        return jsonResponse(500, {
          ok: false,
          error: `Dealer created but auth user failed: ${userError.message}`,
        });
      }

      await supabase.from("profiles").insert({
        id: userData.user.id,
        role: "dealer",
        dealer_id: dealerId,
      });
    }

    return jsonResponse(200, { ok: true, dealer });
  }

  if (event.httpMethod === "PATCH") {
    const dealerId = parseDealerIdFromPath(event.path);
    if (!dealerId) {
      return jsonResponse(400, { ok: false, error: "Dealer ID is required." });
    }

    const body = parseJsonBody(event);
    if (body === null) {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
    }

    const payload = {
      name: body.name,
      status: body.status,
      whatsapp: body.whatsapp,
      logo_url: body.logo_url || body.logoUrl,
    };

    const { data, error } = await supabase
      .from("dealers")
      .update(payload)
      .eq("dealer_id", dealerId)
      .select()
      .single();

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to update dealer." });
    }

    return jsonResponse(200, { ok: true, dealer: data });
  }

  return jsonResponse(405, { ok: false, error: "Method not allowed." });
};
