"use strict";

const { jsonResponse, requireAdmin } = require("./_helpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  const auth = requireAdmin(event);
  if (auth.error) return auth.error;

  return jsonResponse(200, { ok: true, role: auth.admin.role, email: auth.admin.email });
};
