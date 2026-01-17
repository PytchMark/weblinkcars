"use strict";

const {
  jsonResponse,
  requireAuth,
} = require("./_helpers");

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

  const auth = await requireAuth(event, ["dealer"]);
  if (auth.error) return auth.error;

  const dealerId = auth.profile.dealer_id;
  if (!dealerId) {
    return jsonResponse(403, { ok: false, error: "Dealer profile is missing dealer_id." });
  }

  const month = event.queryStringParameters?.month || new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(month);
  if (!bounds) {
    return jsonResponse(400, { ok: false, error: "Invalid month format." });
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const supabase = auth.supabase;

  const [inventory, available, pending, soldMonth, requestsWeek, requestsMonth, bookedMonth, monthRequests] =
    await Promise.all([
      supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("dealer_id", dealerId)
        .eq("status", "available")
        .eq("archived", false),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("dealer_id", dealerId)
        .eq("status", "pending")
        .eq("archived", false),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("dealer_id", dealerId)
        .eq("status", "sold")
        .gte("updated_at", bounds.start.toISOString())
        .lt("updated_at", bounds.end.toISOString()),
      supabase
        .from("viewing_requests")
        .select("id", { count: "exact", head: true })
        .eq("dealer_id", dealerId)
        .gte("created_at", weekAgo.toISOString()),
      supabase
        .from("viewing_requests")
        .select("id", { count: "exact", head: true })
        .eq("dealer_id", dealerId)
        .gte("created_at", bounds.start.toISOString())
        .lt("created_at", bounds.end.toISOString()),
      supabase
        .from("viewing_requests")
        .select("id", { count: "exact", head: true })
        .eq("dealer_id", dealerId)
        .eq("status", "Booked")
        .gte("created_at", bounds.start.toISOString())
        .lt("created_at", bounds.end.toISOString()),
      supabase
        .from("viewing_requests")
        .select("created_at")
        .eq("dealer_id", dealerId)
        .gte("created_at", bounds.start.toISOString())
        .lt("created_at", bounds.end.toISOString()),
    ]);

  if (
    inventory.error ||
    available.error ||
    pending.error ||
    soldMonth.error ||
    requestsWeek.error ||
    requestsMonth.error ||
    bookedMonth.error ||
    monthRequests.error
  ) {
    return jsonResponse(500, { ok: false, error: "Failed to load dashboard." });
  }

  const dailyMap = new Map();
  (monthRequests.data || []).forEach((row) => {
    const day = String(row.created_at || "").slice(0, 10);
    if (!day) return;
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  });

  const dailyRequests = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return jsonResponse(200, {
    ok: true,
    kpis: {
      inventory: inventory.count || 0,
      available: available.count || 0,
      pending: pending.count || 0,
      soldMonth: soldMonth.count || 0,
      requestsWeek: requestsWeek.count || 0,
      requestsMonth: requestsMonth.count || 0,
      bookedMonth: bookedMonth.count || 0,
    },
    dailyRequests,
  });
};
