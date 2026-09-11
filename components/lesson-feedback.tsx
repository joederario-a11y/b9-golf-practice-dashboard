import { lessonFeedbackInline, lessonFeedbackSections } from "../lib/lesson-feedback-format.mjs";

export function LessonFeedback({ text, visibleBullets = 6 }: { text: string; visibleBullets?: number }) {
  const sections = lessonFeedbackSections(text);
  if (!sections.length) return <p className="lesson-feedback-empty">Coach feedback is not available yet.</p>;
  let remaining = Math.max(1, visibleBullets);
  const preview = sections.map(section => {
    const bullets = section.bullets.slice(0, remaining);
    remaining = Math.max(0, remaining - bullets.length);
    return { ...section, bullets };
  }).filter(section => section.bullets.length);
  // Slice by position so repeated section titles remain in the Coach's order.
  let skipped = Math.max(1, visibleBullets);
  const more = sections.map(section => {
    const bullets = section.bullets.slice(skipped);
    skipped = Math.max(0, skipped - section.bullets.length);
    return { ...section, bullets };
  }).filter(section => section.bullets.length);
  const renderSections = (items: typeof sections) => items.map((section, index) => (
    <section className="lesson-feedback-group" key={`${section.title}-${index}`}>
      <h3>{section.title}</h3>
      <ul>{section.bullets.map((bullet, bulletIndex) => (
        <li key={bulletIndex}>{lessonFeedbackInline(bullet).map((part, partIndex) => part.bold
          ? <strong key={partIndex}>{part.text}</strong>
          : part.text)}</li>
      ))}</ul>
    </section>
  ));
  return <div className="lesson-feedback-notes">
    {renderSections(preview)}
    {more.length > 0 && <details className="lesson-feedback-more">
      <summary>More lesson notes <span>({more.reduce((sum, section) => sum + section.bullets.length, 0)})</span></summary>
      {renderSections(more)}
    </details>}
  </div>;
}
