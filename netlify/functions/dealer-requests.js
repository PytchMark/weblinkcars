"use strict";

const { jsonResponse, parseJsonBody, requireAuth } = require("./_helpers");

exports.handler = async (event) => {
  const auth = await requireAuth(event, ["dealer"]);
  if (auth.error) return auth.error;

  const dealerId = auth.profile.dealer_id;
  if (!dealerId) {
    return jsonResponse(403, { ok: false, error: "Dealer profile missing dealer_id." });
  }

  const supabase = auth.supabase;

  if (event.httpMethod === "GET") {
    const { data, error } = await supabase
      .from("viewing_requests")
      .select("id, dealer_id, vehicle_id, request_type, customer_name, phone, email, preferred_date, preferred_time, notes, source, status, created_at")
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false });

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to load requests." });
    }

    return jsonResponse(200, { ok: true, requests: data || [] });
  }

  if (event.httpMethod === "PATCH") {
    const id = decodeURIComponent(event.path.split("/").pop() || "");
    if (!id) {
      return jsonResponse(400, { ok: false, error: "Request ID is required." });
    }

    const body = parseJsonBody(event);
    if (body === null) {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
    }

    const status = body.status;
    const { data, error } = await supabase
      .from("viewing_requests")
      .update({ status })
      .eq("id", id)
      .eq("dealer_id", dealerId)
      .select()
      .single();

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to update request." });
    }

    return jsonResponse(200, { ok: true, request: data });
  }

  return jsonResponse(405, { ok: false, error: "Method not allowed." });
};
