import { useMemo, useState, type ReactNode } from "react";
import { coachRosterCards, rosterLessonDate } from "../lib/coach-roster-policy.mjs";

type Student = { id: string; name: string; email: string; accountStatus?: string; profileImageUrl?: string; createdAt?: string; lastVideoAt?: string };
type Lesson = { ownerId: string; type: string; publicationStatus?: string; uploadedAt: string; lessonDate?: string; updatedAt?: string; uploadedBy?: string; uploadedByRole?: string };

export function CoachStudentRoster({ members, videos, loading, loadingLessons, error, lessonsError, disabled, onAdd, onUpload, onView, onRetry, avatar }: {
  members: Student[]; videos: Lesson[]; loading: boolean; loadingLessons: boolean;
  error: string; lessonsError: string; disabled: boolean;
  onAdd: () => void; onUpload: (student: Student) => void; onView: (student: Student) => void;
  onRetry: () => void; avatar: (student: Student) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const cards = useMemo(() => coachRosterCards(members, videos, search, sort), [members, videos, search, sort]);
  const activeCount = members.filter(member => (member.accountStatus ?? "active") !== "inactive").length;
  return <section className="coach-student-roster" aria-labelledby="coach-roster-title" aria-busy={loading}>
    <header className="coach-roster-heading">
      <div><h2 id="coach-roster-title">My Students</h2><p>Choose a Student. Upload a lesson. Publish feedback.</p></div>
      <button className="primary-action" disabled={disabled} onClick={onAdd} type="button">+ Add Student</button>
    </header>
    <div className="coach-roster-filters">
      <label><span>Search Students</span><input type="search" placeholder="Search by name or email" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label><span>Sort by</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Recently Active</option><option value="alphabetical">Alphabetical</option><option value="added">Recently Added</option></select></label>
    </div>
    {loading ? <p role="status">Loading your Students…</p> : error ? <div role="alert"><p>{error}</p><button className="secondary-action" onClick={onRetry} type="button">Retry loading Students</button></div> : <>
      <p className="coach-roster-count" role="status">{search.trim() ? `${cards.length} of ${activeCount}` : activeCount} {activeCount === 1 ? "Student" : "Students"}</p>
      {lessonsError && <div className="coach-roster-notice" role="status">Lesson status is temporarily unavailable. Your Students are still available. <button className="text-button" onClick={onRetry} type="button">Retry</button></div>}
      {cards.length ? <ul className="coach-roster-grid">{cards.map(({ member, status, lastLessonAt }) => <li className="coach-roster-card" key={member.id}>
        <button className="coach-roster-student" disabled={disabled} onClick={() => onView(member)} type="button" aria-label={`Open ${member.name}'s lessons`}>
          {avatar(member)}<strong>{member.name}</strong><span aria-hidden="true">›</span>
        </button>
        <div className="coach-roster-lesson"><span>Last lesson</span><time>{loadingLessons ? "Loading…" : lessonsError ? "Unavailable" : rosterLessonDate(lastLessonAt)}</time>
          <span className={`coach-roster-status ${status === "Draft" ? "draft" : status === "Published" ? "published" : "needed"}`}>{loadingLessons ? "Loading lessons…" : lessonsError ? "Status unavailable" : status}</span>
        </div>
        <div className="coach-roster-actions"><button className="primary-action" disabled={disabled} onClick={() => onUpload(member)} type="button" aria-label={`Upload lesson for ${member.name}`}>Upload Lesson</button><button className="secondary-action" disabled={disabled} onClick={() => onView(member)} type="button" aria-label={`View lessons for ${member.name}`}>View Lessons</button></div>
      </li>)}</ul> : <div className="coach-roster-empty"><h3>{activeCount ? "No Students match your search" : "Your first lesson starts with a Student"}</h3><p>{activeCount ? "Try another name or email." : "Use + Add Student to invite someone to your roster."}</p>{activeCount > 0 && <button className="secondary-action" onClick={() => setSearch("")} type="button">Clear search</button>}</div>}
    </>}
  </section>;
}
