import React from "react";

export default function ModulePage({ title, description }) {
  return (
    <div className="module-page">
      <section className="app-panel module-hero">
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      <section className="module-grid">
        <article className="app-panel module-card">
          <h3>Status</h3>
          <p>This section is routed and styled inside the new dashboard shell. Feature-specific CRUD screens can now be added without reworking layout.</p>
        </article>

        <article className="app-panel module-card">
          <h3>Navigation</h3>
          <p>The sidebar and header stay visible across authenticated pages so each module can scroll inside the main workspace area.</p>
        </article>
      </section>
    </div>
  );
}
