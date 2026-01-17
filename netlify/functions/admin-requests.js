"use strict";

const { jsonResponse, parseJsonBody, requireAdmin } = require("./_helpers");

function parseRequestIdFromPath(path) {
  const parts = (path || "").split("/").filter(Boolean);
  const idx = parts.indexOf("requests");
  if (idx === -1) return "";
  return decodeURIComponent(parts[idx + 1] || "");
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;

  const supabase = auth.supabase;

  if (event.httpMethod === "GET") {
    const { dealer_id, status } = event.queryStringParameters || {};
    let query = supabase
      .from("viewing_requests")
      .select("id, dealer_id, vehicle_id, request_type, customer_name, phone, email, preferred_date, preferred_time, notes, source, status, created_at")
      .order("created_at", { ascending: false });

    if (dealer_id) query = query.eq("dealer_id", dealer_id);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to load requests." });
    }

    return jsonResponse(200, { ok: true, requests: data || [] });
  }

  if (event.httpMethod === "PATCH") {
    const id = parseRequestIdFromPath(event.path);
    if (!id) {
      return jsonResponse(400, { ok: false, error: "Request ID is required." });
    }

    const body = parseJsonBody(event);
    if (body === null) {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
    }

    const { data, error } = await supabase
      .from("viewing_requests")
      .update({ status: body.status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to update request." });
    }

    return jsonResponse(200, { ok: true, request: data });
  }

  return jsonResponse(405, { ok: false, error: "Method not allowed." });
};
