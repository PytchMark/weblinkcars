"use strict";

const { jsonResponse, parseJsonBody, requireAdmin } = require("./_helpers");

function parseVehicleIdFromPath(path) {
  const parts = (path || "").split("/").filter(Boolean);
  const idx = parts.indexOf("vehicles");
  if (idx === -1) return "";
  return decodeURIComponent(parts[idx + 1] || "");
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

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;

  const supabase = auth.supabase;

  if (event.httpMethod === "GET") {
    const { dealer_id, status } = event.queryStringParameters || {};
    let query = supabase
      .from("vehicles")
      .select(
        "vehicle_id, dealer_id, title, make, model, year, price, mileage, status, archived, availability, description, image_urls, video_url, transmission, fuel_type, body_type, color, vin, updated_at"
      )
      .order("updated_at", { ascending: false });

    if (dealer_id) query = query.eq("dealer_id", dealer_id);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
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

    const payload = {
      dealer_id: body.dealer_id || body.dealerId,
      vehicle_id: body.vehicle_id || body.vehicleId,
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
      image_urls: parseImageUrls(body.image_urls || body.imageUrls),
      video_url: body.video_url || body.videoUrl || null,
      transmission: body.transmission || null,
      fuel_type: body.fuel_type || body.fuelType || null,
      body_type: body.body_type || body.bodyType || null,
      color: body.color || null,
      vin: body.vin || null,
    };

    if (!payload.dealer_id || !payload.vehicle_id) {
      return jsonResponse(400, { ok: false, error: "dealer_id and vehicle_id are required." });
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
    const vehicleId = parseVehicleIdFromPath(event.path);
    if (!vehicleId) {
      return jsonResponse(400, { ok: false, error: "Vehicle ID is required." });
    }

    const body = parseJsonBody(event);
    if (body === null) {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
    }

    const payload = {
      title: body.title,
      make: body.make,
      model: body.model,
      year: body.year ? Number(body.year) : null,
      price: body.price ? Number(body.price) : null,
      mileage: body.mileage ? Number(body.mileage) : null,
      status: body.status,
      archived: typeof body.archived === "boolean" ? body.archived : body.archived === "true",
      availability:
        typeof body.availability === "boolean" ? body.availability : body.availability !== "false",
      description: body.description || body.notes || null,
      image_urls: parseImageUrls(body.image_urls || body.imageUrls),
      video_url: body.video_url || body.videoUrl || null,
      transmission: body.transmission || null,
      fuel_type: body.fuel_type || body.fuelType || null,
      body_type: body.body_type || body.bodyType || null,
      color: body.color || null,
      vin: body.vin || null,
    };

    const { data, error } = await supabase
      .from("vehicles")
      .update(payload)
      .eq("vehicle_id", vehicleId)
      .select()
      .single();

    if (error) {
      return jsonResponse(500, { ok: false, error: "Failed to update vehicle." });
    }

    return jsonResponse(200, { ok: true, vehicle: data });
  }

  return jsonResponse(405, { ok: false, error: "Method not allowed." });
};
