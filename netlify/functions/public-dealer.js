"use strict";

const { createSupabaseServiceClient } = require("../../services/supabase");
const {
  jsonResponse,
  parseDealerIdFromPath,
  isValidDealerId,
} = require("./_helpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  const dealerId = parseDealerIdFromPath(event);
  if (!dealerId || !isValidDealerId(dealerId)) {
    return jsonResponse(400, { ok: false, error: "Invalid dealer ID." });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("dealers")
    .select("dealer_id, name, status, whatsapp, logo_url")
    .eq("dealer_id", dealerId)
    .single();

  if (error || !data) {
    return jsonResponse(404, { ok: false, error: "Dealer not found." });
  }

  if (String(data.status || "").toLowerCase() === "paused") {
    return jsonResponse(404, { ok: false, error: "Dealer not available." });
  }

  return jsonResponse(200, {
    ok: true,
    dealer: {
      dealerId: data.dealer_id,
      name: data.name,
      status: data.status,
      whatsapp: data.whatsapp,
      logoUrl: data.logo_url,
    },
  });
};
