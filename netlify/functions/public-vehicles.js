"use strict";

const { createSupabaseServiceClient } = require("../../services/supabase");
const {
  jsonResponse,
  normalizeDealerIdInput,
  normalizeDealerIdsInput,
  isValidDealerId,
} = require("./_helpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  const dealerId = normalizeDealerIdInput(event.queryStringParameters?.dealerId);
  const dealerIds = normalizeDealerIdsInput(event.queryStringParameters?.dealerIds);
  const ids = dealerId ? [dealerId] : dealerIds;

  const filteredIds = ids.filter((id) => isValidDealerId(id));

  if (!filteredIds.length) {
    return jsonResponse(400, { ok: false, error: "Dealer ID is required." });
  }

  const uniqueIds = [...new Set(filteredIds)].slice(0, 3);

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select(
      "vehicle_id, dealer_id, title, make, model, year, price, mileage, status, archived, availability, description, image_urls, video_url, transmission, fuel_type, body_type, color, updated_at"
    )
    .in("dealer_id", uniqueIds)
    .eq("archived", false)
    .eq("availability", true)
    .order("updated_at", { ascending: false });

  if (error) {
    return jsonResponse(500, { ok: false, error: "Failed to load vehicles." });
  }

  const vehicles = (data || []).map((item) => ({
    dealerId: item.dealer_id,
    vehicleId: item.vehicle_id,
    title: item.title,
    make: item.make,
    model: item.model,
    year: item.year,
    price: item.price,
    mileage: item.mileage,
    status: item.status,
    archived: item.archived,
    availability: item.availability,
    description: item.description,
    imageUrls: item.image_urls || [],
    videoUrl: item.video_url,
    transmission: item.transmission,
    fuelType: item.fuel_type,
    bodyType: item.body_type,
    color: item.color,
    updatedAt: item.updated_at,
  }));

  const counts = vehicles.reduce((acc, vehicle) => {
    acc[vehicle.dealerId] = (acc[vehicle.dealerId] || 0) + 1;
    return acc;
  }, {});

  return jsonResponse(200, { ok: true, vehicles, counts });
};
