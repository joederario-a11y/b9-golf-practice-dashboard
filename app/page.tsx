"use client";

import { useMemo, useState } from "react";

type Tab = "dashboard" | "sessions" | "clubs" | "coach" | "practice" | "import";

type Shot = {
  id: string;
  club: string;
  carry: number;
  total: number;
  ballSpeed: number;
  clubSpeed: number;
  smash: number;
  launch: number;
  spin: number;
  offline: number;
  shape: string;
};

type Session = {
  id: string;
  title: string;
  date: string;
  source: string;
  focus: string;
  shots: Shot[];
};

type Insight = {
  id: string;
  title: string;
  club: string;
  severity: "high" | "medium" | "low";
  metric: string;
  value: string;
  target: string;
  evidence: string;
  action: string;
};

type ClubSummary = {
  club: string;
  shots: number;
  carry: number;
  dispersion: number;
  smash: number;
  launch: number;
  spin: number;
  quality: number;
};

const CLUB_TARGETS: Record<
  string,
  { carry: number; ballSpeed: number; clubSpeed: number; smash: number; launch: number; spin: number }
> = {
  Driver: { carry: 238, ballSpeed: 151, clubSpeed: 102, smash: 1.48, launch: 13, spin: 2550 },
  "3-Wood": { carry: 213, ballSpeed: 139, clubSpeed: 94, smash: 1.48, launch: 13.5, spin: 3300 },
  "5-Wood": { carry: 196, ballSpeed: 130, clubSpeed: 89, smash: 1.46, launch: 15, spin: 4000 },
  "5-Iron": { carry: 171, ballSpeed: 118, clubSpeed: 82, smash: 1.44, launch: 17, spin: 5200 },
  "6-Iron": { carry: 159, ballSpeed: 112, clubSpeed: 78, smash: 1.43, launch: 18, spin: 5800 },
  "7-Iron": { carry: 148, ballSpeed: 106, clubSpeed: 74, smash: 1.43, launch: 19, spin: 6300 },
  "8-Iron": { carry: 136, ballSpeed: 99, clubSpeed: 71, smash: 1.39, launch: 21, spin: 7000 },
  "9-Iron": { carry: 123, ballSpeed: 93, clubSpeed: 68, smash: 1.36, launch: 23, spin: 7800 },
  PW: { carry: 110, ballSpeed: 87, clubSpeed: 65, smash: 1.34, launch: 25, spin: 8500 },
  GW: { carry: 96, ballSpeed: 80, clubSpeed: 60, smash: 1.33, launch: 27, spin: 9100 },
  SW: { carry: 82, ballSpeed: 72, clubSpeed: 56, smash: 1.29, launch: 31, spin: 9800 },
  LW: { carry: 61, ballSpeed: 62, clubSpeed: 50, smash: 1.24, launch: 35, spin: 10300 },
};

const CLUB_ORDER = [
  "Driver",
  "3-Wood",
  "5-Wood",
  "5-Iron",
  "6-Iron",
  "7-Iron",
  "8-Iron",
  "9-Iron",
  "PW",
  "GW",
  "SW",
  "LW",
];

const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌁" },
  { id: "sessions", label: "Sessions", icon: "◫" },
  { id: "clubs", label: "Clubs", icon: "▥" },
  { id: "coach", label: "Coach", icon: "✦" },
  { id: "practice", label: "Practice", icon: "◎" },
  { id: "import", label: "Import", icon: "⇧" },
];

const DEMO_CSV = `club,carry,ballSpeed,clubSpeed,smash,launch,spin,offline
Driver,246,154,104,1.48,13.1,2480,8
Driver,229,148,103,1.44,11.8,3180,-21
7-Iron,151,107,75,1.43,18.5,6320,5
7-Iron,139,102,76,1.34,16.2,7040,-16
PW,111,88,65,1.35,24.8,8720,3
PW,104,83,64,1.30,23.1,9280,-9`;

const SHOT_PATTERNS: Record<string, { carryBias: number; offline: number[]; smashBias: number; launchBias: number; spinBias: number }> = {
  Driver: { carryBias: -5, offline: [18, -24, 10, 6, -16, 26, 4, -7, 13, -20, 9, 18], smashBias: -0.02, launchBias: -1.1, spinBias: 420 },
  "3-Wood": { carryBias: -2, offline: [8, -12, 5, 14, -7, 9, -9, 11], smashBias: -0.01, launchBias: -0.4, spinBias: 180 },
  "5-Wood": { carryBias: 0, offline: [5, 9, -8, 7, -5, 12, 2, -10], smashBias: 0, launchBias: 0.2, spinBias: 120 },
  "5-Iron": { carryBias: -4, offline: [-10, -7, -13, 4, 8, -16, 6, -8, -14], smashBias: -0.025, launchBias: -1.3, spinBias: 360 },
  "6-Iron": { carryBias: -1, offline: [-6, 8, -8, 5, 3, -10, 6, -4, 9], smashBias: -0.01, launchBias: -0.5, spinBias: 170 },
  "7-Iron": { carryBias: -3, offline: [-14, 6, -10, -18, 8, -5, -15, 10, -9, 4], smashBias: -0.02, launchBias: -1.4, spinBias: 480 },
  "8-Iron": { carryBias: 1, offline: [4, -6, 8, -5, 6, -8, 2, -4], smashBias: 0.005, launchBias: 0.3, spinBias: 80 },
  "9-Iron": { carryBias: 0, offline: [3, -5, 4, -6, 7, -4, 5, -3], smashBias: 0, launchBias: 0.4, spinBias: 90 },
  PW: { carryBias: -2, offline: [4, -9, 7, -6, 10, -11, 6, -5], smashBias: -0.01, launchBias: -0.2, spinBias: 260 },
  GW: { carryBias: 2, offline: [3, -5, 4, 6, -4, 5, -6], smashBias: 0.005, launchBias: 0.5, spinBias: 150 },
  SW: { carryBias: -1, offline: [6, -8, 5, -7, 9, -5, 4], smashBias: -0.005, launchBias: 0.7, spinBias: 210 },
  LW: { carryBias: 0, offline: [4, -6, 5, -5, 7, -4], smashBias: 0, launchBias: 0.8, spinBias: 120 },
};

function makeShot(sessionId: string, club: string, index: number, shift: number): Shot {
  const target = CLUB_TARGETS[club] ?? CLUB_TARGETS["7-Iron"];
  const pattern = SHOT_PATTERNS[club] ?? SHOT_PATTERNS["7-Iron"];
  const direction = pattern.offline[index % pattern.offline.length] + shift * (index % 2 === 0 ? 0.8 : -0.4);
  const rhythm = ((index % 5) - 2) * 0.012;
  const carry = target.carry + pattern.carryBias + shift * 0.9 + ((index % 7) - 3) * 2.1;
  const clubSpeed = target.clubSpeed + ((index % 6) - 2) * 0.8 + shift * 0.18;
  const ballSpeed = target.ballSpeed + pattern.carryBias * 0.35 + ((index % 4) - 1.5) * 1.6 + shift * 0.35;
  const smash = Math.max(1.18, Math.min(1.51, target.smash + pattern.smashBias + rhythm));
  const launch = target.launch + pattern.launchBias + ((index % 5) - 2) * 0.55;
  const spin = target.spin + pattern.spinBias + ((index % 6) - 2.5) * 115;

  return {
    id: `${sessionId}-${club}-${index}`,
    club,
    carry: round(carry),
    total: round(carry * (club === "Driver" ? 1.11 : 1.04)),
    ballSpeed: round(ballSpeed),
    clubSpeed: round(clubSpeed),
    smash: round(smash, 2),
    launch: round(launch),
    spin: Math.round(spin),
    offline: round(direction),
    shape: direction < -15 ? "Pull" : direction < -6 ? "Draw" : direction > 15 ? "Slice" : direction > 6 ? "Fade" : "Straight",
  };
}

function makeSession(id: string, title: string, date: string, source: string, focus: string, clubs: string[], shift: number): Session {
  const shots = clubs.flatMap((club) => {
    const count = club === "Driver" ? 14 : club.includes("Wood") ? 10 : club.length <= 2 ? 9 : 12;
    return Array.from({ length: count }, (_, index) => makeShot(id, club, index, shift));
  });

  return { id, title, date, source, focus, shots };
}

const BASE_SESSIONS: Session[] = [
  makeSession("s1", "Driver start-line block", "2026-06-22", "TrackMan", "Tee accuracy", ["Driver", "3-Wood"], 4),
  makeSession("s2", "Approach ladder", "2026-06-18", "Foresight GCQuad", "Carry windows", ["5-Iron", "6-Iron", "7-Iron", "8-Iron"], 2),
  makeSession("s3", "Wedge matrix", "2026-06-14", "SkyTrak", "Distance control", ["PW", "GW", "SW", "LW"], -1),
  makeSession("s4", "Pre-round tune", "2026-06-09", "Mevo+", "Bag blend", ["Driver", "7-Iron", "PW"], -2),
  makeSession("s5", "Full bag baseline", "2026-06-02", "TrackMan", "Benchmark", ["Driver", "5-Wood", "6-Iron", "8-Iron", "PW", "SW"], -4),
  makeSession("s6", "Long iron strike", "2026-05-26", "GCQuad", "Contact", ["5-Iron", "6-Iron", "7-Iron"], -5),
];

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function getSeverityScore(severity: Insight["severity"]) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function summarizeClubs(sessions: Session[]): ClubSummary[] {
  const shotsByClub = new Map<string, Shot[]>();
  sessions.flatMap((session) => session.shots).forEach((shot) => {
    shotsByClub.set(shot.club, [...(shotsByClub.get(shot.club) ?? []), shot]);
  });

  return CLUB_ORDER.filter((club) => shotsByClub.has(club)).map((club) => {
    const shots = shotsByClub.get(club) ?? [];
    const target = CLUB_TARGETS[club];
    const carry = average(shots.map((shot) => shot.carry));
    const dispersion = standardDeviation(shots.map((shot) => shot.offline));
    const smash = average(shots.map((shot) => shot.smash));
    const launch = average(shots.map((shot) => shot.launch));
    const spin = average(shots.map((shot) => shot.spin));
    const strikeScore = Math.max(0, 100 - Math.abs((target?.smash ?? 1.4) - smash) * 450);
    const dispersionScore = Math.max(0, 100 - dispersion * 3.4);
    const launchScore = Math.max(0, 100 - Math.abs((target?.launch ?? launch) - launch) * 7);

    return {
      club,
      shots: shots.length,
      carry: round(carry),
      dispersion: round(dispersion),
      smash: round(smash, 2),
      launch: round(launch),
      spin: Math.round(spin),
      quality: Math.round(average([strikeScore, dispersionScore, launchScore])),
    };
  });
}

function computeInsights(clubs: ClubSummary[], sessions: Session[]): Insight[] {
  const insights: Insight[] = [];

  clubs.forEach((club) => {
    const target = CLUB_TARGETS[club.club];
    if (!target) return;

    if (club.dispersion > 15) {
      insights.push({
        id: `${club.club}-dispersion`,
        title: "Start-line spread is costing playable misses",
        club: club.club,
        severity: club.dispersion > 19 ? "high" : "medium",
        metric: "Offline spread",
        value: `±${club.dispersion} yd`,
        target: "±12 yd",
        evidence: `${club.club} shots are finishing wide enough to turn solid distance into missed targets.`,
        action: "Run a 20-ball gate test and record face angle after every five shots.",
      });
    }

    if (club.smash < target.smash - 0.035) {
      insights.push({
        id: `${club.club}-strike`,
        title: "Energy transfer is leaking through strike quality",
        club: club.club,
        severity: club.smash < target.smash - 0.06 ? "high" : "medium",
        metric: "Smash factor",
        value: club.smash.toFixed(2),
        target: target.smash.toFixed(2),
        evidence: `Average smash trails the club benchmark, so speed is not becoming ball speed consistently.`,
        action: "Use foot-spray contact mapping for three sets of seven swings.",
      });
    }

    if (club.launch < target.launch - 1.4) {
      insights.push({
        id: `${club.club}-launch`,
        title: "Launch window is too low for reliable carry",
        club: club.club,
        severity: "medium",
        metric: "Launch angle",
        value: `${club.launch}°`,
        target: `${target.launch}°`,
        evidence: `The ball is launching below the expected window, which narrows descent angle and stopping power.`,
        action: "Move ball position half a ball forward and compare 10-shot launch average.",
      });
    }

    if (club.spin > target.spin * 1.14) {
      insights.push({
        id: `${club.club}-spin`,
        title: "Spin is creating extra curvature and ballooning",
        club: club.club,
        severity: "low",
        metric: "Spin rate",
        value: `${club.spin} rpm`,
        target: `${target.spin} rpm`,
        evidence: `Spin is above the working range, especially when contact drifts low on the face.`,
        action: "Track strike height and dynamic loft together during the next block.",
      });
    }
  });

  const recent = sessions.slice(0, 2).flatMap((session) => session.shots);
  const older = sessions.slice(2).flatMap((session) => session.shots);
  if (recent.length && older.length && average(recent.map((shot) => shot.smash)) < average(older.map((shot) => shot.smash)) - 0.015) {
    insights.push({
      id: "trend-smash",
      title: "Recent strike trend is drifting down",
      club: "All clubs",
      severity: "high",
      metric: "Recent smash",
      value: average(recent.map((shot) => shot.smash)).toFixed(2),
      target: average(older.map((shot) => shot.smash)).toFixed(2),
      evidence: "The last two sessions are less efficient than the prior baseline.",
      action: "Start next session with 12 half-speed swings before full-speed work.",
    });
  }

  return insights.sort((a, b) => getSeverityScore(b.severity) - getSeverityScore(a.severity)).slice(0, 7);
}

function parseCsv(text: string): Shot[] {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return [];
  const headers = rows[0].split(",").map((header) => header.trim().toLowerCase());
  const read = (cells: string[], name: string, fallback = 0) => {
    const index = headers.indexOf(name.toLowerCase());
    if (index < 0) return fallback;
    const parsed = Number(cells[index]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return rows.slice(1).map((row, index) => {
    const cells = row.split(",").map((cell) => cell.trim());
    const club = cells[headers.indexOf("club")] || "7-Iron";
    const target = CLUB_TARGETS[club] ?? CLUB_TARGETS["7-Iron"];
    const clubSpeed = read(cells, "clubspeed", target.clubSpeed);
    const ballSpeed = read(cells, "ballspeed", target.ballSpeed);
    const offline = read(cells, "offline", 0);

    return {
      id: `csv-${Date.now()}-${index}`,
      club,
      carry: read(cells, "carry", target.carry),
      total: read(cells, "total", read(cells, "carry", target.carry) * 1.04),
      ballSpeed,
      clubSpeed,
      smash: read(cells, "smash", ballSpeed / clubSpeed),
      launch: read(cells, "launch", target.launch),
      spin: Math.round(read(cells, "spin", target.spin)),
      offline,
      shape: offline < -12 ? "Draw" : offline > 12 ? "Fade" : "Straight",
    };
  });
}

function buildImportedSession(shots: Shot[]): Session {
  const today = "2026-06-23";
  return {
    id: `import-${Date.now()}`,
    title: "Imported sim session",
    date: today,
    source: "CSV Upload",
    focus: "New data",
    shots,
  };
}

function cls(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sessions, setSessions] = useState<Session[]>(BASE_SESSIONS);
  const [selectedSessionId, setSelectedSessionId] = useState(BASE_SESSIONS[0].id);
  const [csvText, setCsvText] = useState(DEMO_CSV);
  const [importMessage, setImportMessage] = useState("Demo CSV loaded");

  const clubs = useMemo(() => summarizeClubs(sessions), [sessions]);
  const insights = useMemo(() => computeInsights(clubs, sessions), [clubs, sessions]);
  const allShots = useMemo(() => sessions.flatMap((session) => session.shots), [sessions]);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const avgCarry = round(average(allShots.map((shot) => shot.carry)));
  const avgSmash = round(average(allShots.map((shot) => shot.smash)), 2);
  const avgDispersion = round(standardDeviation(allShots.map((shot) => shot.offline)));
  const performanceIndex = Math.round(average(clubs.map((club) => club.quality)));
  const topInsight = insights[0];

  function importCsv() {
    const shots = parseCsv(csvText);
    if (!shots.length) {
      setImportMessage("No rows detected");
      return;
    }
    const nextSession = buildImportedSession(shots);
    setSessions((current) => [nextSession, ...current]);
    setSelectedSessionId(nextSession.id);
    setActiveTab("dashboard");
    setImportMessage(`${shots.length} shots imported`);
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="GolfIQ navigation">
        <div className="brand-lockup">
          <div className="brand-mark">GIQ</div>
          <div>
            <strong>GolfIQ</strong>
            <span>Sim performance</span>
          </div>
        </div>
        <nav className="rail-nav">
          {NAV_ITEMS.map((item) => (
            <button
              className={cls("rail-button", activeTab === item.id && "active")}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <span>Data health</span>
          <strong>{allShots.length} shots</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">June performance review</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activeTab)?.label}</h1>
          </div>
          <div className="topbar-actions" aria-label="Session controls">
            <button className="icon-button" title="Refresh analysis" onClick={() => setSessions([...sessions])}>
              ↻
            </button>
            <button className="primary-action" onClick={() => setActiveTab("import")}>
              <span>⇧</span>
              Import
            </button>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <DashboardView
            avgCarry={avgCarry}
            avgDispersion={avgDispersion}
            avgSmash={avgSmash}
            clubs={clubs}
            insights={insights}
            performanceIndex={performanceIndex}
            selectedSession={selectedSession}
            sessions={sessions}
            shots={allShots}
            topInsight={topInsight}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "sessions" && (
          <SessionsView
            selectedSession={selectedSession}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
            setActiveTab={setActiveTab}
            setSelectedSessionId={setSelectedSessionId}
          />
        )}

        {activeTab === "clubs" && <ClubsView clubs={clubs} />}

        {activeTab === "coach" && <CoachView insights={insights} />}

        {activeTab === "practice" && <PracticeView insights={insights} />}

        {activeTab === "import" && (
          <ImportView
            csvText={csvText}
            importCsv={importCsv}
            importMessage={importMessage}
            setCsvText={setCsvText}
          />
        )}
      </section>
    </main>
  );
}

function DashboardView({
  avgCarry,
  avgDispersion,
  avgSmash,
  clubs,
  insights,
  performanceIndex,
  selectedSession,
  sessions,
  setActiveTab,
  shots,
  topInsight,
}: {
  avgCarry: number;
  avgDispersion: number;
  avgSmash: number;
  clubs: ClubSummary[];
  insights: Insight[];
  performanceIndex: number;
  selectedSession: Session;
  sessions: Session[];
  shots: Shot[];
  topInsight?: Insight;
  setActiveTab: (tab: Tab) => void;
}) {
  return (
    <div className="view-stack">
      <section className="metric-grid">
        <Kpi label="Performance index" value={performanceIndex} unit="/100" tone="green" />
        <Kpi label="Average carry" value={avgCarry} unit="yd" tone="blue" />
        <Kpi label="Shot dispersion" value={`±${avgDispersion}`} unit="yd" tone="amber" />
        <Kpi label="Smash factor" value={avgSmash.toFixed(2)} unit="avg" tone="coral" />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <PanelHeader
            kicker="Shot pattern"
            title={selectedSession.title}
            meta={`${formatDate(selectedSession.date)} · ${selectedSession.source}`}
            action={<button className="text-button" onClick={() => setActiveTab("sessions")}>Sessions</button>}
          />
          <ShotMap shots={selectedSession.shots} />
        </article>

        <article className="panel">
          <PanelHeader kicker="Coach priority" title={topInsight?.club ?? "All clubs"} meta={topInsight?.metric ?? "No urgent flags"} />
          {topInsight ? (
            <div className="priority-card">
              <span className={cls("severity-dot", topInsight.severity)} />
              <h3>{topInsight.title}</h3>
              <dl>
                <div>
                  <dt>Current</dt>
                  <dd>{topInsight.value}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{topInsight.target}</dd>
                </div>
              </dl>
              <p>{topInsight.action}</p>
            </div>
          ) : (
            <EmptyState title="No major coaching flags" body="The current data set is inside the working windows." />
          )}
        </article>

        <article className="panel">
          <PanelHeader kicker="Club ladder" title="Carry gaps" meta={`${clubs.length} clubs tracked`} />
          <GapLadder clubs={clubs} />
        </article>

        <article className="panel panel-large">
          <PanelHeader kicker="Trend line" title="Session quality" meta={`${sessions.length} sessions`} />
          <TrendChart sessions={sessions} />
        </article>

        <article className="panel">
          <PanelHeader kicker="Insights" title="Active flags" meta={`${insights.length} coaching notes`} />
          <InsightList insights={insights.slice(0, 4)} compact />
        </article>

        <article className="panel">
          <PanelHeader kicker="Bag profile" title="Club quality" meta={`${shots.length} shots`} />
          <QualityBars clubs={clubs.slice(0, 6)} />
        </article>
      </section>
    </div>
  );
}

function SessionsView({
  selectedSession,
  selectedSessionId,
  sessions,
  setActiveTab,
  setSelectedSessionId,
}: {
  selectedSession: Session;
  selectedSessionId: string;
  sessions: Session[];
  setActiveTab: (tab: Tab) => void;
  setSelectedSessionId: (id: string) => void;
}) {
  const selectedClubs = summarizeClubs([selectedSession]);

  return (
    <section className="split-view">
      <div className="panel">
        <PanelHeader kicker="Session log" title="Recent sim work" meta={`${sessions.length} sessions`} />
        <div className="session-list">
          {sessions.map((session) => {
            const sessionShots = session.shots;
            const carry = round(average(sessionShots.map((shot) => shot.carry)));
            const dispersion = round(standardDeviation(sessionShots.map((shot) => shot.offline)));
            return (
              <button
                className={cls("session-row", session.id === selectedSessionId && "active")}
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <span>
                  <strong>{session.title}</strong>
                  <small>{formatDate(session.date)} · {session.source}</small>
                </span>
                <span className="row-metric">{carry} yd</span>
                <span className="row-metric">±{dispersion}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel panel-large">
        <PanelHeader
          kicker={selectedSession.focus}
          title={selectedSession.title}
          meta={`${selectedSession.shots.length} shots · ${selectedSession.source}`}
          action={<button className="text-button" onClick={() => setActiveTab("coach")}>Coach notes</button>}
        />
        <ShotMap shots={selectedSession.shots} />
        <div className="club-table compact-table">
          <div className="table-row table-head">
            <span>Club</span>
            <span>Shots</span>
            <span>Carry</span>
            <span>Dispersion</span>
            <span>Smash</span>
          </div>
          {selectedClubs.map((club) => (
            <div className="table-row" key={club.club}>
              <span>{club.club}</span>
              <span>{club.shots}</span>
              <span>{club.carry} yd</span>
              <span>±{club.dispersion}</span>
              <span>{club.smash.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClubsView({ clubs }: { clubs: ClubSummary[] }) {
  return (
    <div className="view-stack">
      <section className="panel">
        <PanelHeader kicker="Bag map" title="Club-by-club performance" meta={`${clubs.length} active clubs`} />
        <div className="club-table">
          <div className="table-row table-head">
            <span>Club</span>
            <span>Shots</span>
            <span>Carry</span>
            <span>Gap</span>
            <span>Dispersion</span>
            <span>Launch</span>
            <span>Spin</span>
            <span>Quality</span>
          </div>
          {clubs.map((club, index) => {
            const nextClub = clubs[index + 1];
            const gap = nextClub ? round(club.carry - nextClub.carry) : null;
            return (
              <div className="table-row" key={club.club}>
                <span>{club.club}</span>
                <span>{club.shots}</span>
                <span>{club.carry} yd</span>
                <span className={cls(gap !== null && (gap < 8 || gap > 18) && "warning-text")}>{gap ? `${gap} yd` : "—"}</span>
                <span>±{club.dispersion}</span>
                <span>{club.launch}°</span>
                <span>{club.spin}</span>
                <span>
                  <QualityPill score={club.quality} />
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dashboard-grid two-up">
        <article className="panel">
          <PanelHeader kicker="Carry ladder" title="Yardage spacing" meta="Driver through wedges" />
          <GapLadder clubs={clubs} extended />
        </article>
        <article className="panel">
          <PanelHeader kicker="Quality" title="Strike and control" meta="Composite score" />
          <QualityBars clubs={clubs} />
        </article>
      </section>
    </div>
  );
}

function CoachView({ insights }: { insights: Insight[] }) {
  return (
    <section className="panel panel-wide">
      <PanelHeader kicker="Coach engine" title="Prioritized swing and bag notes" meta={`${insights.length} active findings`} />
      <InsightList insights={insights} />
    </section>
  );
}

function PracticeView({ insights }: { insights: Insight[] }) {
  const priority = insights[0];
  const practiceBlocks = [
    {
      time: "10 min",
      title: "Calibration",
      body: "Half-speed swings with face tape, then record launch and smash only.",
      metric: "Contact cluster",
    },
    {
      time: "20 min",
      title: priority?.club === "Driver" ? "Start-line gate" : "Carry window ladder",
      body: priority?.action ?? "Alternate target yardages and keep dispersion inside the working window.",
      metric: priority?.metric ?? "Dispersion",
    },
    {
      time: "15 min",
      title: "Transfer set",
      body: "Randomize clubs and commit to one target before stepping into each ball.",
      metric: "Decision quality",
    },
  ];

  return (
    <section className="practice-board">
      <div className="panel panel-large">
        <PanelHeader
          kicker="Next session"
          title={priority ? priority.title : "Maintenance block"}
          meta={priority ? `${priority.club} · ${priority.metric}` : "Balanced practice"}
        />
        <div className="practice-track">
          {practiceBlocks.map((block, index) => (
            <article className="practice-step" key={block.title}>
              <span className="step-index">{index + 1}</span>
              <div>
                <small>{block.time}</small>
                <h3>{block.title}</h3>
                <p>{block.body}</p>
                <strong>{block.metric}</strong>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <PanelHeader kicker="Targets" title="Session scorecard" meta="Track after each block" />
        <div className="scorecard-list">
          {["Start line inside 12 yd", "Smash within 0.03 band", "Carry window inside 8 yd", "One note after each club"].map((item) => (
            <label key={item} className="check-row">
              <input type="checkbox" />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function ImportView({
  csvText,
  importCsv,
  importMessage,
  setCsvText,
}: {
  csvText: string;
  importCsv: () => void;
  importMessage: string;
  setCsvText: (value: string) => void;
}) {
  return (
    <section className="import-grid">
      <div className="panel panel-large">
        <PanelHeader kicker="CSV" title="Simulator data import" meta={importMessage} />
        <textarea
          className="csv-input"
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          spellCheck={false}
        />
        <div className="button-row">
          <button className="secondary-action" onClick={() => setCsvText(DEMO_CSV)}>Load demo rows</button>
          <button className="primary-action" onClick={importCsv}>
            <span>⇧</span>
            Analyze rows
          </button>
        </div>
      </div>

      <div className="panel">
        <PanelHeader kicker="Sources" title="Sim platforms" meta="Ready mappings" />
        <div className="source-grid">
          {["TrackMan", "Foresight GCQuad", "Mevo+", "SkyTrak", "Full Swing", "Manual"].map((source) => (
            <button className="source-tile" key={source}>
              <span>{source.slice(0, 2).toUpperCase()}</span>
              <strong>{source}</strong>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, unit, tone }: { label: string; value: number | string; unit: string; tone: "green" | "blue" | "amber" | "coral" }) {
  return (
    <article className={cls("kpi", tone)}>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </article>
  );
}

function PanelHeader({
  action,
  kicker,
  meta,
  title,
}: {
  action?: React.ReactNode;
  kicker: string;
  meta?: string;
  title: string;
}) {
  return (
    <div className="panel-header">
      <div>
        <p>{kicker}</p>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {action}
    </div>
  );
}

function ShotMap({ shots }: { shots: Shot[] }) {
  const maxCarry = Math.max(...shots.map((shot) => shot.carry), 1);
  const minCarry = Math.min(...shots.map((shot) => shot.carry), 0);
  const clubNames = Array.from(new Set(shots.map((shot) => shot.club))).slice(0, 6);

  return (
    <div className="shot-map">
      <svg viewBox="0 0 760 360" role="img" aria-label="Shot dispersion chart">
        <defs>
          <linearGradient id="fairway" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e3f7ec" />
            <stop offset="100%" stopColor="#d8ecff" />
          </linearGradient>
        </defs>
        <rect x="24" y="18" width="712" height="314" rx="8" fill="url(#fairway)" />
        <path d="M380 40 C438 92 462 170 430 322" fill="none" stroke="#ffffff" strokeWidth="72" strokeLinecap="round" opacity="0.62" />
        <path d="M380 40 C438 92 462 170 430 322" fill="none" stroke="#34a853" strokeWidth="2" strokeDasharray="8 8" opacity="0.65" />
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1={92 + line * 174} x2={92 + line * 174} y1="28" y2="322" stroke="#ffffff" strokeWidth="1" opacity="0.85" />
        ))}
        {[0, 1, 2].map((line) => (
          <line key={line} x1="36" x2="724" y1={92 + line * 78} y2={92 + line * 78} stroke="#ffffff" strokeWidth="1" opacity="0.85" />
        ))}
        {shots.map((shot, index) => {
          const x = 380 + shot.offline * 7.2;
          const y = 306 - ((shot.carry - minCarry) / Math.max(1, maxCarry - minCarry)) * 242;
          const clubIndex = clubNames.indexOf(shot.club);
          return (
            <circle
              cx={Math.max(44, Math.min(716, x))}
              cy={Math.max(42, Math.min(312, y))}
              fill={["#177245", "#1769aa", "#d97706", "#d84a4a", "#7c3aed", "#0f766e"][clubIndex] ?? "#177245"}
              key={shot.id}
              opacity="0.82"
              r={index % 3 === 0 ? 5.4 : 4.4}
            />
          );
        })}
      </svg>
      <div className="map-legend">
        {clubNames.map((club, index) => (
          <span key={club}>
            <i style={{ background: ["#177245", "#1769aa", "#d97706", "#d84a4a", "#7c3aed", "#0f766e"][index] }} />
            {club}
          </span>
        ))}
      </div>
    </div>
  );
}

function GapLadder({ clubs, extended = false }: { clubs: ClubSummary[]; extended?: boolean }) {
  const maxCarry = Math.max(...clubs.map((club) => club.carry), 1);

  return (
    <div className="gap-list">
      {clubs.slice(0, extended ? clubs.length : 7).map((club, index) => {
        const nextClub = clubs[index + 1];
        const gap = nextClub ? round(club.carry - nextClub.carry) : null;
        return (
          <div className="gap-row" key={club.club}>
            <div>
              <strong>{club.club}</strong>
              <span>{club.carry} yd</span>
            </div>
            <div className="gap-track">
              <i style={{ width: `${Math.max(12, (club.carry / maxCarry) * 100)}%` }} />
            </div>
            <em className={cls(gap !== null && (gap < 8 || gap > 18) && "flagged")}>{gap ? `${gap} yd` : "top"}</em>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ sessions }: { sessions: Session[] }) {
  const points = [...sessions].reverse().map((session) => {
    const clubs = summarizeClubs([session]);
    return {
      label: formatDate(session.date),
      quality: Math.round(average(clubs.map((club) => club.quality))),
    };
  });
  const width = 720;
  const height = 220;
  const plotted = points.map((point, index) => {
    const x = 42 + (index / Math.max(1, points.length - 1)) * (width - 84);
    const y = height - 34 - (point.quality / 100) * (height - 68);
    return { ...point, x, y };
  });
  const path = plotted.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Session quality trend">
        {[25, 50, 75].map((line) => {
          const y = height - 34 - (line / 100) * (height - 68);
          return <line key={line} x1="34" x2={width - 28} y1={y} y2={y} stroke="#d8e1ea" strokeWidth="1" />;
        })}
        <path d={path} fill="none" stroke="#177245" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {plotted.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="6" fill="#ffffff" stroke="#177245" strokeWidth="3" />
            <text x={point.x} y={height - 10} textAnchor="middle" fill="#607083" fontSize="12">{point.label}</text>
            <text x={point.x} y={point.y - 12} textAnchor="middle" fill="#1f2b37" fontSize="12" fontWeight="700">{point.quality}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function InsightList({ compact = false, insights }: { compact?: boolean; insights: Insight[] }) {
  if (!insights.length) return <EmptyState title="Clean report" body="No active alerts from this data set." />;

  return (
    <div className={cls("insight-list", compact && "compact")}>
      {insights.map((insight) => (
        <article className="insight-card" key={insight.id}>
          <div className="insight-topline">
            <span className={cls("severity-pill", insight.severity)}>{insight.severity}</span>
            <strong>{insight.club}</strong>
          </div>
          <h3>{insight.title}</h3>
          {!compact && <p>{insight.evidence}</p>}
          <dl>
            <div>
              <dt>{insight.metric}</dt>
              <dd>{insight.value}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{insight.target}</dd>
            </div>
          </dl>
          <small>{insight.action}</small>
        </article>
      ))}
    </div>
  );
}

function QualityBars({ clubs }: { clubs: ClubSummary[] }) {
  return (
    <div className="quality-list">
      {clubs.map((club) => (
        <div className="quality-row" key={club.club}>
          <span>{club.club}</span>
          <div>
            <i style={{ width: `${club.quality}%` }} />
          </div>
          <strong>{club.quality}</strong>
        </div>
      ))}
    </div>
  );
}

function QualityPill({ score }: { score: number }) {
  return <span className={cls("quality-pill", score >= 80 ? "good" : score >= 68 ? "ok" : "work")}>{score}</span>;
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}
