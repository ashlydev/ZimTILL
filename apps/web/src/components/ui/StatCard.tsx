import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {helper ? <span>{helper}</span> : null}
    </article>
  );
}
