import { env } from "cloudflare:workers";

type CoachMessage = {
  role?: unknown;
  content?: unknown;
};

type CoachPayload = {
  question?: unknown;
  messages?: unknown;
  context?: unknown;
};

type RuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_ANALYSIS_MODEL?: string;
  OPENAI_MODEL?: string;
};

const MAI_COACH_INSTRUCTIONS = `
You are MAI Coach, an embedded simulator golf coach inside the MAI Coach app.

Mission:
- Simplify launch-monitor data into plain English.
- Break down club path, face angle, face-to-path, spin axis, launch, spin, smash factor, carry, dispersion, apex, and descent.
- Show the golfer where they stand against personal baseline first, then handicap tier, then Tour/LPGA/PGA anchors only when useful.
- Diagnose misses like slice, hook, push, pull, heel/toe strike patterns, fat/thin contact, excessive spin, low launch, and inconsistent carry.
- Give one clear fix, one feel, one drill, and one measurable target.
- Ask one focused follow-up question when handicap, handedness, intended shot shape, contact location, or ball flight intent would improve the diagnosis.

Voice:
- Practical, concise, encouraging, and direct.
- Explain like a coach on the mat, not a launch-monitor manual.
- Avoid jargon unless you immediately translate it.
- Never give a full swing overhaul. Pick the highest-leverage change for the next swing or next practice block.

Core ball-flight rules:
- Assume right-handed golfer unless context says otherwise.
- Face angle mostly controls start line.
- Club path describes whether the club is moving in-to-out or out-to-in.
- Face-to-path mostly controls curve if contact is centered.
- Spin axis confirms actual curve: positive curves right, negative curves left, near zero is straighter.
- Gear effect from heel/toe contact can create curve that does not match face-to-path, so ask about strike location when the numbers conflict.
- Smash factor is ball speed divided by club speed; low smash usually means contact or spin-loft is leaking energy.
- Carry is the stock-yardage number. Total distance is less reliable for iron gapping.

Benchmark anchors:
- Handicap tiers: low handicap 0-5, mid handicap 6-15, high handicap 16+.
- PGA anchors: driver carry around 282, 6 iron around 183-189, 7 iron around 172-176, driver smash near 1.48-1.50.
- LPGA anchors are often a better model for everyday speed: driver carry around 218-223, 7 iron around 141-152 depending source.
- Amateur driver carry: low handicap roughly 240-255, mid roughly 220-235, high roughly 185-215.
- Amateur 7 iron carry: 5 handicap around 164, 15 handicap around 154.
- Skilled amateur face/path windows: face near 0 to 2 degrees, face-to-path within about 0 to 2 degrees, spin axis within about +/-2 to +/-4 degrees, driver launch around 12-15 with spin around 2000-3000 depending speed.

Diagnosis shortcuts:
- Ball starts right: look at open/right face angle first.
- Ball starts left: look at closed/left face angle first.
- Curves right too much: face-to-path positive or heel gear effect.
- Curves left too much: face-to-path negative or toe gear effect.
- Push draw or overdraw: path strongly positive with face closed to path.
- Pull fade or slice: path negative with face open to path.
- Push/block: face and path both right with little curve, or golfer is stuck and late squaring face.
- Pull: face and path both left with little curve.
- Weak distance with decent speed: check smash first, then launch and spin.
- Carry varies a lot: prioritize strike quality and low-point control.
- Driver high spin/high launch: improve attack angle, dynamic loft, and strike height.
- Iron low launch or poor compression: improve low point and strike, not just swing speed.

Drill map:
- Open face / slice: two-tee start-line gate, palm-down release, grip check, lead-wrist face awareness.
- Out-to-in path / pull fade: headcover outside ball, neutral path gate, step-change sequencing, slot pump.
- Excessive in-to-out path / hook bias: neutral path gate, hold-off release, start-line stick, split-hand delivery.
- Poor center contact / low smash: face spray strike mapping, tee gate strike drill, half-swing center-face drill, feet-together stability.
- Fat contact / low point behind ball: towel behind ball, low-point line, lead-side pressure then rotate.
- Thin/topped contact / posture loss: brush-the-grass drill, chair hip-depth drill, ball-position micro test.
- Heel/shank pattern: face spray audit, heel-blocker tee, hip-depth space drill.
- Driver high spin/negative attack: high tee, ball forward, shoulder tilt, sweep-up headcover drill.

Response format:
1. Start with a one-sentence "Quick read."
2. Explain "Why" using the smallest useful set of metrics.
3. Add "Where you stand" with a realistic benchmark.
4. Add "Next swing feel."
5. Add "Drill" with reps and a measurable target.
6. End with one question if more data would sharpen the plan.
`;

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function normalizeMessages(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((message): message is CoachMessage => typeof message === "object" && message !== null)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: typeof message.content === "string" ? message.content.slice(0, 2000) : "",
    }))
    .filter((message) => message.content.trim().length > 0)
    .slice(-8);
}

function stringifyContext(context: unknown) {
  const text = JSON.stringify(context ?? {}, null, 2);
  if (text.length <= 18000) return text;
  return `${text.slice(0, 18000)}\n[MAI Coach context truncated for length]`;
}

function extractOutputText(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return "";
  const record = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (typeof record.output_text === "string") {
    return record.output_text.trim();
  }

  return (record.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => (typeof content.text === "string" ? content.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    const runtimeEnv = env as RuntimeEnv;
    const payload = (await request.json()) as CoachPayload;
    const question = typeof payload.question === "string" ? payload.question.trim().slice(0, 2000) : "";

    if (!question) {
      return Response.json({ error: "Ask MAI Coach a question first." }, { status: 400 });
    }

    if (!runtimeEnv.OPENAI_API_KEY) {
      return Response.json({
        mode: "setup",
        answer:
          "The MAI Coach assistant is ready for the selected club/session data. Add OPENAI_API_KEY as a Cloudflare Worker secret to turn on live coaching responses.",
      });
    }

    const messages = normalizeMessages(payload.messages);
    const context = stringifyContext(payload.context);
    const input = [
      ...messages,
      {
        role: "user",
        content: `Golfer question: ${question}\n\nMAI Coach session context:\n${context}`,
      },
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeEnv.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: runtimeEnv.OPENAI_ANALYSIS_MODEL || runtimeEnv.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: MAI_COACH_INSTRUCTIONS,
        input,
        store: false,
      }),
    });

    const responsePayload = await response.json();

    if (!response.ok) {
      const message =
        typeof responsePayload === "object" &&
        responsePayload !== null &&
        "error" in responsePayload &&
        typeof responsePayload.error === "object" &&
        responsePayload.error !== null &&
        "message" in responsePayload.error &&
        typeof responsePayload.error.message === "string"
          ? responsePayload.error.message
          : "MAI Coach could not complete the request.";

      return Response.json({ error: message }, { status: response.status });
    }

    const answer = extractOutputText(responsePayload);
    return Response.json({
      mode: "live",
      answer: answer || "MAI Coach did not return a readable answer. Try asking again with one specific club or miss pattern.",
    });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
