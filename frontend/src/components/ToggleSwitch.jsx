import React from "react";

// Compact enterprise-style toggle: 42×24 track, 18px thumb, 3px inset padding on every edge, clipped
// so the thumb can never render outside the track regardless of column width. The button's own padding
// pads out its click/tap target well past 44×44 without inflating the visible switch.
export default function ToggleSwitch({ on, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={on}
      className="relative shrink-0 p-2.5 -m-2.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#121214]"
    >
      <span
        className={`flex items-center w-[42px] h-[24px] rounded-full overflow-hidden p-[3px] transition-colors duration-200 ${
          on ? "bg-primary hover:bg-primary/90" : "bg-border hover:bg-border/70"
        }`}
      >
        <span
          className={`w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
            on ? "translate-x-[18px]" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
