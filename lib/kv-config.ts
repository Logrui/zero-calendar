import { createClient } from "@vercel/kv"


const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN environment variables not set");
}

export const kv = createClient({
  url: url,
  token: token,
});


export async function testKvConnection() {
  try {

    await kv.set("test_connection", "working")
    const result = await kv.get("test_connection")

    return {
      success: true,
      message: "KV connection successful",
      result,
      environmentVariables: {
        KV_URL: url ? "Set (value hidden)" : "Not set",
        KV_TOKEN: token ? "Set (value hidden)" : "Not set",

        NODE_ENV: process.env.NODE_ENV,
      },
    }
  } catch (error) {
    return {
      success: false,
      message: "KV connection failed",
      error: error instanceof Error ? error.message : "Unknown error",
      environmentVariables: {
        KV_URL: url ? "Set (value hidden)" : "Not set",
        KV_TOKEN: token ? "Set (value hidden)" : "Not set",

        NODE_ENV: process.env.NODE_ENV,
      },
    }
  }
}
