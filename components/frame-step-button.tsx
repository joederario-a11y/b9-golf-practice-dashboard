"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function FrameStepButton({ children, disabled = false, onStep }: {
  children: ReactNode; disabled?: boolean; onStep: () => Promise<boolean>;
}) {
  const step = useRef(onStep); step.current = onStep;
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => { generation.current++; clearTimeout(timer.current); };
  const begin = () => {
    stop();
    const token = generation.current;
    const repeat = async (first: boolean) => {
      try {
        const moved = await step.current();
        if (!moved || generation.current !== token) return;
        timer.current = setTimeout(() => void repeat(false), first ? 300 : 100);
      } catch { stop(); }
    };
    void repeat(true);
  };
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hide);
    return () => { stop(); window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", hide); };
  }, []);
  useEffect(() => { if (disabled) stop(); }, [disabled]);
  return <button type="button" className="secondary-action compact-action frame-step-button" disabled={disabled}
    title="Click for one frame. Hold to move slowly."
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault(); event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      begin();
    }}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
    onKeyDown={event => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (!event.repeat) begin();
    }}
    onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stop(); } }}
    onClick={event => {
      // Keyboard/assistive activation without a pointerdown still steps once.
      if (event.detail === 0) void step.current().catch(() => {});
    }}
  >{children}</button>;
}
