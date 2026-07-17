export const METRIC_EDUCATION_VIDEO_PRELOAD = "metadata";

export const SMASH_FACTOR_VIDEO = Object.freeze({
  src: "/videos/metrics/smash-factor.mp4",
  poster: "/videos/metrics/smash-factor-poster.jpg",
  title: "Why Smash Factor Matters",
  description: "See how centered contact turns club speed into ball speed.",
  durationLabel: "1:00",
});

const CARD_TITLES = Object.freeze({
  what: "What is it?",
  meaning: "What does my number mean?",
  target: "What should I aim for?",
  improve: "How can I improve it?",
});

function compactSentence(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function joinEducationSentences(sentences) {
  return sentences.map(compactSentence).filter(Boolean).join(" ");
}

function formatMetricValue(metric) {
  const decimals = Number.isFinite(metric?.decimals) ? metric.decimals : 1;
  if (!Number.isFinite(metric?.rawValue)) return "NA";
  return metric.rawValue.toFixed(decimals);
}

export function getMetricEducationContent(metric) {
  const comparisonContext = joinEducationSentences([metric?.compare, metric?.tourBenchmark]);
  const sharedContent = {
    metricKey: metric?.id ?? "",
    title: metric?.label ?? "Metric",
    definition: compactSentence(metric?.what),
    numberMeaning: joinEducationSentences([metric?.meaning, comparisonContext]),
    targetExplanation: compactSentence(metric?.aimFor),
    improvementAdvice: compactSentence(metric?.howToImprove),
  };

  if (metric?.id !== "smash") {
    return sharedContent;
  }

  const value = formatMetricValue(metric);
  return {
    ...sharedContent,
    definition:
      "Smash factor is ball speed divided by club speed. It shows how efficiently the strike transferred energy from the club to the ball.",
    numberMeaning: joinEducationSentences([
      Number.isFinite(metric.rawValue)
        ? `Your smash factor is ${value}. For this club and speed window, that suggests some energy may be getting lost at impact. The first thing to investigate is strike location and contact consistency, not simply swinging harder.`
        : sharedContent.numberMeaning,
      comparisonContext,
    ]),
    targetExplanation: compactSentence(metric.aimFor).replace(
      "for this club window",
      "for this club and your current speed range",
    ),
    improvementAdvice:
      "Use foot spray or impact tape and hit ten controlled shots. Score how many strikes finish within the center portion of the face. Improve the strike pattern before adding speed.",
    video: SMASH_FACTOR_VIDEO,
  };
}

export function buildMetricEducationCards(content) {
  return [
    {
      id: "what",
      title: CARD_TITLES.what,
      body: compactSentence(content?.definition),
    },
    {
      id: "meaning",
      title: CARD_TITLES.meaning,
      body: compactSentence(content?.numberMeaning),
    },
    {
      id: "target",
      title: CARD_TITLES.target,
      body: compactSentence(content?.targetExplanation),
    },
    {
      id: "improve",
      title: CARD_TITLES.improve,
      body: compactSentence(content?.improvementAdvice),
    },
  ];
}

export function metricEducationHasVideo(content) {
  return Boolean(content?.video?.src);
}
