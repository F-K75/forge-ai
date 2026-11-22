export default function GlobalBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none bg-base transition-colors duration-200"
      aria-hidden="true"
    >
      {/* Subtle directional studio skylight wash */}
      <div
        className="absolute inset-0 opacity-70 dark:opacity-100"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(37, 99, 235, 0.06), transparent 70%)",
        }}
      />
    </div>
  );
}
