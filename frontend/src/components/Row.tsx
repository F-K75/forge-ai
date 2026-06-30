interface RowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export function Row({ label, description, children }: RowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-t first:border-t-0 border-border-soft">
      <div className="mr-4 min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {description && (
          <p className="text-xs text-faint mt-0.5 break-all">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
