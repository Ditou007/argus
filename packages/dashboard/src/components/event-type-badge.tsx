const TYPE_COLORS: Record<string, string> = {
  process_exec: "#22c55e",
  process_exit: "#f59e0b",
  process_kprobe: "#3b82f6",
  unknown: "#737373",
};

/**
 * A colored pill for a Tetragon event type (the `process_` prefix is dropped).
 * @function TypeBadge
 * @param props - the raw event type
 * @returns the badge element
 */
export const TypeBadge = ({ type }: { type: string }) => {
  const color = TYPE_COLORS[type] ?? "#737373";
  const label = type.replace("process_", "");
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.125rem 0.5rem",
        borderRadius: "4px",
        fontSize: "0.6875rem",
        fontWeight: 500,
        fontFamily: "monospace",
        backgroundColor: `${color}1a`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  );
};
