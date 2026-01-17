"use strict";

const { createSupabaseServiceClient } = require("../../services/supabase");
const {
  jsonResponse,
  parseJsonBody,
  parseDealerIdFromPath,
  isValidDealerId,
} = require("./_helpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  const dealerId = parseDealerIdFromPath(event);
  if (!dealerId || !isValidDealerId(dealerId)) {
    return jsonResponse(400, { ok: false, error: "Invalid dealer ID." });
  }

  const payload = parseJsonBody(event);
  if (payload === null) {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
  }

  const customerName = String(payload.customer_name || payload.customerName || "").trim();
  const phone = String(payload.phone || "").trim();
  const requestType = String(payload.request_type || payload.requestType || "").trim();

  if (!customerName || !phone || !requestType) {
    return jsonResponse(400, { ok: false, error: "customer_name, phone, and request_type are required." });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("viewing_requests")
    .insert({
      dealer_id: dealerId,
      vehicle_id: payload.vehicle_id || payload.vehicleId || null,
      request_type: requestType,
      customer_name: customerName,
      phone,
      email: payload.email || null,
      preferred_date: payload.preferred_date || payload.preferredDate || null,
      preferred_time: payload.preferred_time || payload.preferredTime || null,
      notes: payload.notes || null,
      source: "Storefront",
      status: "New",
    })
    .select()
    .single();

  if (error) {
    return jsonResponse(500, { ok: false, error: "Failed to create request." });
  }

  return jsonResponse(200, { ok: true, request: data });
};
