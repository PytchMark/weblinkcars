"use strict";

const crypto = require("crypto");
const { jsonResponse, parseJsonBody, requireAuth } = require("./_helpers");

function generateVehicleId() {
  return `VEH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function parseImageUrls(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value
      .replace(/\n/g, ",")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function buildPayload(body, dealerId) {
  return {
    dealer_id: dealerId,
    vehicle_id: body.vehicle_id || body.vehicleId || body.vehicleID,
    title: body.title || null,
    make: body.make || null,
    model: body.model || null,
    year: body.year ? Number(body.year) : null,
    price: body.price ? Number(body.price) : null,
    mileage: body.mileage ? Number(body.mileage) : null,
    status: body.status || "available",
    archived: typeof body.archived === "boolean" ? body.archived : body.archived === "true",
    availability:
      typeof body.availability === "boolean" ? body.availability : body.availability !== "false",
    description: body.description || body.notes || null,
    image_urls: parseImageUrls(body.image_urls || body.imageUrls || body.cloudinaryImageUrls),
    video_url: body.video_url || body.videoUrl || body.cloudinaryVideoUrl || null,
    transmission: body.transmission || null,
    fuel_type: body.fuel_type || body.fuelType || null,
    body_type: body.body_type || body.bodyType || null,
    color: body.color || null,
    vin: body.vin || null,
  };
}

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
      .from("vehicles")
      .select(
        "vehicle_id, dealer_id, title, make, model, year, price, mileage, status, archived, availability, description, image_urls, video_url, transmission, fuel_type, body_type, color, vin, updated_at"
      )
      .eq("dealer_id", dealerId)
      .order("updated_at", { ascending: false });

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to load vehicles." });
    }

    return jsonResponse(200, { ok: true, vehicles: data || [] });
  }

  if (event.httpMethod === "POST") {
    const body = parseJsonBody(event);
    if (body === null) {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
    }

    const payload = buildPayload(body, dealerId);
    if (!payload.vehicle_id) {
      payload.vehicle_id = generateVehicleId();
    }

    const { data, error } = await supabase
      .from("vehicles")
      .upsert(payload, { onConflict: "vehicle_id" })
      .select()
      .single();

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to save vehicle." });
    }

    return jsonResponse(200, { ok: true, vehicle: data });
  }

  if (event.httpMethod === "PATCH") {
    const vehicleId = decodeURIComponent(event.path.split("/").pop() || "");
    if (!vehicleId) {
      return jsonResponse(400, { ok: false, error: "Vehicle ID is required." });
    }

    const body = parseJsonBody(event);
    if (body === null) {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
    }

    const payload = buildPayload(body, dealerId);
    delete payload.vehicle_id;
    delete payload.dealer_id;

    const { data, error } = await supabase
      .from("vehicles")
      .update(payload)
      .eq("vehicle_id", vehicleId)
      .eq("dealer_id", dealerId)
      .select()
      .single();

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to update vehicle." });
    }

    return jsonResponse(200, { ok: true, vehicle: data });
  }

  return jsonResponse(405, { ok: false, error: "Method not allowed." });
};
