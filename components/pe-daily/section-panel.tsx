import type { ReactNode } from "react";

export function SectionPanel({
  id,
  title,
  actions,
  children,
}: {
  id: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pe-daily-panel" aria-labelledby={`${id}-title`}>
      <div className="pe-daily-panel-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        {actions ? <div className="pe-daily-panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
