"use client";

import { useState } from "react";

/**
 * Read-only value with a copy button.
 *
 * Falls back to selecting the text when the clipboard API is unavailable
 * (older browsers, or any non-secure origin), so the field is never a dead end.
 */
export function CopyField({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.getElementById("copy-field-input");
      if (input instanceof HTMLInputElement) input.select();
    }
  }

  return (
    <div className={`panel reg p-5 ${className ?? ""}`}>
      <label htmlFor="copy-field-input" className="label">
        {label}
      </label>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <input
          id="copy-field-input"
          readOnly
          value={value}
          className="field min-w-0 flex-1 text-sm"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" onClick={copy} className="btn btn-ghost shrink-0">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </div>
  );
}
