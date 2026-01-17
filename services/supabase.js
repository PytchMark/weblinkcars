"use strict";

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(value, name) {
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

function createSupabaseClient() {
  return createClient(assertEnv(SUPABASE_URL, "SUPABASE_URL"), assertEnv(SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createSupabaseServiceClient() {
  return createClient(
    assertEnv(SUPABASE_URL, "SUPABASE_URL"),
    assertEnv(SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

module.exports = {
  createSupabaseClient,
  createSupabaseServiceClient,
};
