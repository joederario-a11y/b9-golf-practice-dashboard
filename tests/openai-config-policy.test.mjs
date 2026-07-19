import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyOpenAIKey,
  getOpenAIConfigurationIssue,
  hasUsableOpenAIConfiguration,
} from "../lib/openai-config-policy.mjs";

test("OpenAI configuration policy classifies usable and unusable keys", () => {
  assert.equal(classifyOpenAIKey(""), "missing");
  assert.equal(classifyOpenAIKey("   "), "missing");
  assert.equal(classifyOpenAIKey(undefined), "missing");
  assert.equal(classifyOpenAIKey("re_" + "provider_key"), "wrong_provider");
  assert.equal(classifyOpenAIKey("RE-provider-key"), "wrong_provider");
  assert.equal(classifyOpenAIKey("pk_live_provider_key"), "invalid_format");
  assert.equal(classifyOpenAIKey("not-a-provider-key"), "invalid_format");
  assert.equal(classifyOpenAIKey("sk-" + "test-openai-key"), "configured");
  assert.equal(classifyOpenAIKey(" sk-" + "proj-test-openai-key "), "configured");
});

test("OpenAI configuration issue is safe to return without exposing secret material", () => {
  const wrongProviderKey = "re_" + "secret_should_not_appear";
  const issue = getOpenAIConfigurationIssue({ OPENAI_API_KEY: wrongProviderKey });

  assert.equal(issue?.category, "wrong_provider_api_key");
  assert.equal(issue?.code, "openai_api_key_wrong_provider");
  assert.equal(issue?.keyStatus, "wrong_provider");
  assert.equal(issue?.statusCode, 503);
  assert.equal(issue?.publicMessage.includes(wrongProviderKey), false);
  assert.equal(issue?.technicalMessage.includes(wrongProviderKey), false);
});

test("OpenAI configuration policy reports usable state only for OpenAI-shaped keys", () => {
  assert.equal(hasUsableOpenAIConfiguration({ OPENAI_API_KEY: "sk-" + "test-openai-key" }), true);
  assert.equal(hasUsableOpenAIConfiguration({ OPENAI_API_KEY: "re_" + "provider_key" }), false);
  assert.equal(hasUsableOpenAIConfiguration({ OPENAI_API_KEY: "" }), false);
});
