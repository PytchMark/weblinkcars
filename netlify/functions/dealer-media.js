"use strict";

const { jsonResponse, parseJsonBody, requireAuth } = require("./_helpers");

function sanitizeFilename(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  const auth = await requireAuth(event, ["dealer"]);
  if (auth.error) return auth.error;

  const dealerId = auth.profile.dealer_id;
  if (!dealerId) {
    return jsonResponse(403, { ok: false, error: "Dealer profile missing dealer_id." });
  }

  const payload = parseJsonBody(event);
  if (payload === null) {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
  }

  const vehicleId = String(payload.vehicleId || payload.vehicle_id || "").trim();
  const filename = sanitizeFilename(payload.filename || "");
  const contentType = String(payload.contentType || payload.content_type || "application/octet-stream");
  const data = payload.data;

  if (!vehicleId || !filename || !data) {
    return jsonResponse(400, { ok: false, error: "vehicleId, filename, and data are required." });
  }

  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) {
    return jsonResponse(400, { ok: false, error: "Invalid file data." });
  }

  const path = `dealers/${dealerId}/vehicles/${vehicleId}/${filename}`;
  const { error: uploadError } = await auth.supabase.storage
    .from("vehicle-media")
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    return jsonResponse(500, { ok: false, error: "Failed to upload media." });
  }

  const { data: publicUrl } = auth.supabase.storage.from("vehicle-media").getPublicUrl(path);

  return jsonResponse(200, { ok: true, url: publicUrl.publicUrl, path });
};
