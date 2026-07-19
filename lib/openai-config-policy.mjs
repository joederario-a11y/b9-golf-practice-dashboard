export const OPENAI_CONFIGURATION_ERROR_CODES = new Set([
  "openai_api_key_invalid_format",
  "openai_api_key_missing",
  "openai_api_key_wrong_provider",
]);

export function classifyOpenAIKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) return "missing";
  if (/^re[_-]/i.test(key)) return "wrong_provider";
  if (!/^sk-/i.test(key)) return "invalid_format";
  return "configured";
}

export function getOpenAIConfigurationIssue(runtime = {}) {
  const keyStatus = classifyOpenAIKey(runtime.OPENAI_API_KEY);
  if (keyStatus === "configured") return null;

  if (keyStatus === "wrong_provider") {
    return {
      category: "wrong_provider_api_key",
      code: "openai_api_key_wrong_provider",
      keyStatus,
      publicMessage: "MAI Coach OpenAI features are temporarily unavailable while the Dev Worker OpenAI key is reconfigured.",
      statusCode: 503,
      technicalMessage: "OPENAI_API_KEY is configured with a non-OpenAI provider key.",
    };
  }

  if (keyStatus === "invalid_format") {
    return {
      category: "invalid_api_key_format",
      code: "openai_api_key_invalid_format",
      keyStatus,
      publicMessage: "MAI Coach OpenAI features are temporarily unavailable while the Dev Worker OpenAI key is reconfigured.",
      statusCode: 503,
      technicalMessage: "OPENAI_API_KEY does not look like an OpenAI API key.",
    };
  }

  return {
    category: "missing_api_key",
    code: "openai_api_key_missing",
    keyStatus,
    publicMessage: "MAI Coach OpenAI features are not connected in this environment.",
    statusCode: 503,
    technicalMessage: "OPENAI_API_KEY is not configured.",
  };
}

export function hasUsableOpenAIConfiguration(runtime = {}) {
  return getOpenAIConfigurationIssue(runtime) === null;
}
