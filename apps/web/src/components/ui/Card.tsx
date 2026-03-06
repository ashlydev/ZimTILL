import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../lib/format";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
};

export function Card({ title, subtitle, action, className, children, ...props }: CardProps) {
  return (
    <section className={classNames("card", className)} {...props}>
      {title || subtitle || action ? (
        <div className="card-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className="subtle-text">{subtitle}</p> : null}
          </div>
          {action ? <div className="card-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
