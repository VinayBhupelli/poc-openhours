"use client";

import { useState, useEffect } from "react";
import { Focus, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("oh_theme");
    if (stored === "focus") {
      setFocusMode(true);
      document.documentElement.setAttribute("data-theme", "focus");
    }
  }, []);

  function toggle() {
    const next = !focusMode;
    setFocusMode(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "focus");
      localStorage.setItem("oh_theme", "focus");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("oh_theme", "default");
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 border"
      style={{
        background: focusMode ? "#eff6ff" : "#eef2ff",
        color: focusMode ? "#3b82f6" : "#6366f1",
        borderColor: focusMode ? "#bfdbfe" : "#c7d2fe",
      }}
      title={focusMode ? "Switch to Standard" : "Switch to Focus Mode"}
    >
      {focusMode ? (
        <>
          <Focus className="w-3.5 h-3.5" /> Focus
        </>
      ) : (
        <>
          <Sun className="w-3.5 h-3.5" /> Standard
        </>
      )}
    </button>
  );
}
