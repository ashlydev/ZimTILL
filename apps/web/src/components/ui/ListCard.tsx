import type { ReactNode } from "react";

type ListField = {
  label: string;
  value: ReactNode;
};

type ListCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  fields?: ListField[];
  actions?: ReactNode;
};

export function ListCard({ title, subtitle, badge, fields = [], actions }: ListCardProps) {
  return (
    <article className="list-card">
      <div className="list-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="subtle-text">{subtitle}</p> : null}
        </div>
        {badge ? <div>{badge}</div> : null}
      </div>

      {fields.length > 0 ? (
        <dl className="list-card-fields">
          {fields.map((field, index) => (
            <div key={`${field.label}-${index}`}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actions ? <div className="list-card-actions">{actions}</div> : null}
    </article>
  );
}
