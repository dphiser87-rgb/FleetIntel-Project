import React, { useState, useEffect } from "react";
import { checkContrast, checkLegibility, isValidHex, DEFAULT_GROUP_COLOR } from "@/lib/color";
import { ArrowCounterClockwise, Warning } from "@phosphor-icons/react";

// All pre-verified to pass WCAG AA 4.5:1 against either white or near-black text.
export const PRESET_SWATCHES = ["#34C759", "#FF3B30", "#FFCC00", "#3B82F6", "#A855F7", "#14B8A6", "#F97316", "#EC4899"];

export default function GroupColorPicker({ value, onChange, defaultColor = DEFAULT_GROUP_COLOR, groupName = "Group name" }) {
  const [customHex, setCustomHex] = useState(value || defaultColor);

  useEffect(() => { setCustomHex(value || defaultColor); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = value || defaultColor;
  const contrast = checkContrast(current);

  const applyCustom = (hex) => {
    setCustomHex(hex);
    if (isValidHex(hex)) onChange(hex);
  };

  const customCheck = isValidHex(customHex) ? checkLegibility(customHex) : null;

  return (
    <div className="space-y-3" data-testid="group-color-picker">
      <div className="flex items-center gap-2 flex-wrap">
        {PRESET_SWATCHES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            data-testid={`swatch-${s}`}
            className="w-7 h-7 rounded-md border-2 transition-transform hover:scale-110"
            style={{ background: s, borderColor: current.toUpperCase() === s.toUpperCase() ? "#fff" : "transparent" }}
            aria-label={`Choose color ${s}`}
            aria-pressed={current.toUpperCase() === s.toUpperCase()}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={customHex}
          onChange={(e) => applyCustom(e.target.value)}
          placeholder="#RRGGBB"
          data-testid="custom-hex-input"
          className="w-32 bg-[#121214] border border-border px-2 py-1.5 text-sm mono focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(defaultColor)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          data-testid="reset-color-default"
        >
          <ArrowCounterClockwise size={13} /> Reset to default
        </button>
      </div>

      {customCheck && !customCheck.passes && (
        <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 border border-primary/30 px-3 py-2" data-testid="contrast-fail-msg">
          <Warning size={14} className="mt-0.5 shrink-0" />
          <span>
            This color fails WCAG AA contrast against the app background (ratio {customCheck.ratio.toFixed(2)}:1,
            needs 4.5:1) and won't be legible as a label or swatch. Pick a preset above, or try a lighter/more
            saturated shade — the color is still applied, but consider a more accessible alternative.
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Preview:</span>
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: current, color: contrast.textColor || "#fff" }}
          data-testid="color-preview-badge"
        >
          {groupName || "Group name"}
        </span>
        {!contrast.passes && <span className="text-[10px] text-muted-foreground">(using fallback text color — still low contrast)</span>}
      </div>
    </div>
  );
}
