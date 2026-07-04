interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ on, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-base",
        "transition-colors motion-reduce:transition-none",
        on ? "bg-ink" : "bg-border",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none block h-4 w-4 rounded-full shadow-sm",
          "transform transition-transform motion-reduce:transition-none",
          on ? "translate-x-4 bg-base" : "translate-x-0 bg-ink",
        ].join(" ")}
      />
    </button>
  );
}
