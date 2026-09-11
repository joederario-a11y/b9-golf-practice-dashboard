const headings = new Map([
  ["what we worked on", "What We Worked On"],
  ["worked on", "What We Worked On"],
  ["key takeaways", "Key Takeaways"],
  ["what to focus on", "Key Takeaways"],
  ["main focus", "Key Takeaways"],
  ["what to remember", "What to Remember"],
  ["practice drills", "Practice Drills"],
  ["practice next", "Practice Next"],
  ["next steps", "Next Steps"],
]);

// Presentation only: keep the saved Coach text untouched, including its qualifiers.
export function lessonFeedbackSections(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  const sections = [];
  let current;
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s+|^\d+[.)]\s+/, "");
    if (!line) continue;
    const heading = line.replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").replace(/:$/, "").trim();
    const title = headings.get(heading.toLowerCase());
    if (title || (/^#{1,6}\s/.test(line) && heading.length <= 80)) {
      current = { title: title || heading, bullets: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: "Key Takeaways", bullets: [] };
      sections.push(current);
    }
    const sentences = Array.from(segmenter.segment(line), item => item.segment.trim()).filter(Boolean);
    // Two sentences preserve a cue and its explanation while breaking up prose.
    for (let index = 0; index < sentences.length; index += 2) {
      const bullet = sentences.slice(index, index + 2).join(" ");
      if (!current.bullets.includes(bullet)) current.bullets.push(bullet);
    }
  }
  return sections.filter(section => section.bullets.length);
}

export function lessonFeedbackInline(value) {
  const parts = String(value).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  const hasEmphasis = parts.some(part => part.startsWith("**") && part.endsWith("**"));
  if (!hasEmphasis) {
    const cue = /^([^:]{1,55}:)(\s+)([\s\S]+)$/.exec(String(value));
    if (cue) return [{ text: cue[1], bold: true }, { text: cue[2] + cue[3], bold: false }];
  }
  return parts.map(part => ({
    text: part.startsWith("**") && part.endsWith("**") ? part.slice(2, -2) : part,
    bold: part.startsWith("**") && part.endsWith("**"),
  }));
}
