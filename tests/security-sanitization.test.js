const assert = require("node:assert/strict");
const test = require("node:test");

const { sanitizeErrorMessage, supabaseFetch } = require("../api/_utils");

async function withEnv(patch, callback) {
  const previous = new Map();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("sanitizeErrorMessage redacts common backend secrets", () => {
  const jwt = `eyJ${"a".repeat(120)}`;
  const longToken = "z".repeat(120);
  const message = sanitizeErrorMessage(
    `failed access_token=abc123 refresh_token=def456 client_secret=s3cr3t authorization: bearer ${jwt} sb_secret_test_${longToken} raw ${longToken}`
  );

  assert.doesNotMatch(message, /abc123|def456|s3cr3t|sb_secret_test|eyJ[a]+|z{96}/);
  assert.match(message, /access_token=\[redacted\]/);
  assert.match(message, /refresh_token=\[redacted\]/);
  assert.match(message, /client_secret=\[redacted\]/);
  assert.match(message, /\[redacted-secret\]/);
  assert.match(message, /\[redacted-token\]/);
});

test("supabaseFetch sanitizes failed response bodies before throwing", async () => {
  const previousFetch = global.fetch;
  await withEnv(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_key"
    },
    async () => {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
      });

      try {
        await assert.rejects(
          () => supabaseFetch("seo_landings?select=id&limit=1"),
          (error) => {
            assert.equal(String(error.message).includes("abc123"), false);
            assert.equal(String(error.message).includes("sb_secret_live"), false);
            assert.match(error.message, /access_token=\[redacted\]/);
            assert.match(error.message, /\[redacted-secret\]/);
            return true;
          }
        );
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});
