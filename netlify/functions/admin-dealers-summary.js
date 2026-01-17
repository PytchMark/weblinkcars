"use strict";

const { jsonResponse, requireAuth } = require("./_helpers");

function monthBounds(month) {
  if (!/^[0-9]{4}-[0-9]{2}$/.test(month)) return null;
  const start = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  const auth = await requireAuth(event, ["admin"]);
  if (auth.error) return auth.error;

  const month = event.queryStringParameters?.month || new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(month);
  if (!bounds) {
    return jsonResponse(400, { ok: false, error: "Invalid month format." });
  }

  const supabase = createSupabaseServiceClient();

  const [dealersRes, vehiclesRes, requestsRes] = await Promise.all([
    supabase.from("dealers").select("dealer_id, name, status"),
    supabase
      .from("vehicles")
      .select("dealer_id, status, archived, availability")
      .eq("archived", false),
    supabase
      .from("viewing_requests")
      .select("dealer_id, status, created_at")
      .gte("created_at", bounds.start.toISOString())
      .lt("created_at", bounds.end.toISOString()),
  ]);

  if (dealersRes.error || vehiclesRes.error || requestsRes.error) {
    return jsonResponse(500, { ok: false, error: "Failed to load summary." });
  }

  const dealers = dealersRes.data || [];
  const vehicles = vehiclesRes.data || [];
  const requests = requestsRes.data || [];

  const summary = dealers.map((dealer) => {
    const dealerVehicles = vehicles.filter((v) => v.dealer_id === dealer.dealer_id);
    const dealerRequests = requests.filter((r) => r.dealer_id === dealer.dealer_id);

    const available = dealerVehicles.filter((v) => v.status === "available" && v.availability !== false).length;
    const sold = dealerVehicles.filter((v) => v.status === "sold").length;
    const reqTotal = dealerRequests.length;
    const reqBooked = dealerRequests.filter((r) => r.status === "Booked").length;

    return {
      dealerId: dealer.dealer_id,
      name: dealer.name,
      status: dealer.status,
      kpis: {
        inventory: dealerVehicles.length,
        available,
        sold,
        requests: reqTotal,
        booked: reqBooked,
      },
    };
  });

  const totals = summary.reduce(
    (acc, item) => {
      acc.dealers += 1;
      acc.inventory += item.kpis.inventory;
      acc.available += item.kpis.available;
      acc.sold += item.kpis.sold;
      acc.requests += item.kpis.requests;
      return acc;
    },
    { dealers: 0, inventory: 0, available: 0, sold: 0, requests: 0 }
  );

  return jsonResponse(200, {
    ok: true,
    month,
    dealers: summary,
    totals,
  });
};
