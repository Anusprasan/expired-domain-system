import React, { useMemo } from "react";
import {
  getDevelopmentStatusLabel,
  getGscStatusLabel,
  getHostingStatusLabel,
} from "../constants/developmentLanguage";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

function formatDateTime(value, locale) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(locale);
}

function formatPerson(user, fallback = "-") {
  if (!user) {
    return fallback;
  }

  if (typeof user === "string") {
    return user || fallback;
  }

  return user.fullName || user.email || fallback;
}

function buildTimeline(item, copy, language) {
  const events = [];

  if (item.createdAt) {
    events.push({
      key: "created",
      title: copy.domainDetails.timeline.domainAdded,
      actor: formatPerson(item.addedBy),
      timestamp: item.createdAt,
      detail: item.domain || "-",
    });
  }

  if (item.assignedAt) {
    events.push({
      key: "assigned",
      title: copy.domainDetails.timeline.developmentAssigned,
      actor: formatPerson(item.assignedBy),
      timestamp: item.assignedAt,
      detail: formatPerson(item.assignedDeveloperId, copy.domainDetails.timeline.noDeveloperAssigned),
    });
  }

  if (item.contentEditingAt) {
    events.push({
      key: "content-editing",
      title: copy.domainDetails.timeline.contentEditingStarted,
      actor: formatPerson(item.contentEditorId),
      timestamp: item.contentEditingAt,
      detail: copy.domainDetails.timeline.contentLockOpened,
    });
  }

  if (item.contentUpdatedAt) {
    events.push({
      key: "content-updated",
      title: copy.domainDetails.timeline.contentSaved,
      actor: formatPerson(item.contentUpdatedBy),
      timestamp: item.contentUpdatedAt,
      detail: copy.domainDetails.timeline.contentUpdatedDetail,
    });
  }

  if (item.updatedAt) {
    events.push({
      key: "updated",
      title: copy.domainDetails.timeline.latestRecordUpdate,
      actor: formatPerson(item.contentUpdatedBy || item.assignedDeveloperId || item.assignedBy || item.addedBy),
      timestamp: item.updatedAt,
      detail: copy.domainDetails.timeline.statusDetail(
        getDevelopmentStatusLabel(item.developmentStatus, language),
        getHostingStatusLabel(item.hostingStatus, language),
        getGscStatusLabel(item.gscStatus, language)
      ),
    });
  }

  return events
    .filter((event) => event.timestamp)
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

export default function DevelopmentDomainDetailsPanel({ item, onClose }) {
  const { copy, language, locale } = useDevelopmentUiCopy();
  const timeline = useMemo(() => buildTimeline(item, copy, language), [copy, item, language]);
  const content = item.content || {};
  const resources = item.resources || {};
  const contentReady = Boolean(
    content.title?.trim()
    && content.description?.trim()
    && content.article?.trim()
    && Array.isArray(resources.logos)
    && resources.logos.length > 0
    && resources.heroImage?.trim()
    && resources.favicon?.trim()
  );

  return (
    <section className="app-panel development-domain-details-panel">
      <div className="development-domain-details-header">
        <div className="development-domain-details-title">
          <span className="development-domain-details-eyebrow">{copy.domainDetails.eyebrow}</span>
          <h3>{item.domain || "-"}</h3>
          <p>{item.brandName || "-"} {item.landingPage ? `| ${item.landingPage}` : ""}</p>
        </div>
        <button type="button" className="management-button-secondary" onClick={onClose}>
          {copy.domainDetails.closeDetails}
        </button>
      </div>

      <div className="development-domain-details-statuses">
        <span className="management-badge">{getDevelopmentStatusLabel(item.developmentStatus, language)}</span>
        <span className="management-badge">{getHostingStatusLabel(item.hostingStatus, language)}</span>
        <span className="management-badge">{getGscStatusLabel(item.gscStatus, language)}</span>
        <span className={`management-badge ${contentReady ? "is-active" : "is-inactive"}`}>
          {contentReady ? copy.domainDetails.contentReady : copy.domainDetails.contentPending}
        </span>
      </div>

      <div className="development-domain-details-grid">
        <article className="development-domain-details-card">
          <strong>{copy.domainDetails.ownership}</strong>
          <dl className="development-domain-details-list">
            <div>
              <dt>{copy.domainDetails.addedBy}</dt>
              <dd>{formatPerson(item.addedBy)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.addedOn}</dt>
              <dd>{formatDateTime(item.createdAt, locale)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.assignedBy}</dt>
              <dd>{formatPerson(item.assignedBy)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.assignedOn}</dt>
              <dd>{formatDateTime(item.assignedAt, locale)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.developer}</dt>
              <dd>{formatPerson(item.assignedDeveloperId, copy.domainDetails.notAssigned)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.lastUpdated}</dt>
              <dd>{formatDateTime(item.updatedAt, locale)}</dd>
            </div>
          </dl>
        </article>

        <article className="development-domain-details-card">
          <strong>{copy.domainDetails.contentSection}</strong>
          <dl className="development-domain-details-list">
            <div>
              <dt>{copy.domainDetails.contentAddedBy}</dt>
              <dd>{formatPerson(item.contentUpdatedBy, copy.domainDetails.notAddedYet)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.contentAddedOn}</dt>
              <dd>{formatDateTime(item.contentUpdatedAt, locale)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.editingBy}</dt>
              <dd>{formatPerson(item.contentEditorId, copy.domainDetails.noActiveEditor)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.editingStarted}</dt>
              <dd>{formatDateTime(item.contentEditingAt, locale)}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.title}</dt>
              <dd>{content.title?.trim() || "-"}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.note}</dt>
              <dd>{content.note?.trim() || "-"}</dd>
            </div>
          </dl>
        </article>

        <article className="development-domain-details-card">
          <strong>{copy.domainDetails.buildSetup}</strong>
          <dl className="development-domain-details-list">
            <div>
              <dt>{copy.domainDetails.info}</dt>
              <dd>{item.templateId?.name || copy.domainDetails.noInfoSelected}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.infoNotes}</dt>
              <dd>{item.templateId?.notes || "-"}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.progress}</dt>
              <dd>{item.progressPercent ?? 0}%</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.logos}</dt>
              <dd>{Array.isArray(resources.logos) ? resources.logos.length : 0}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.buttonsGifs}</dt>
              <dd>{Array.isArray(resources.gifs) ? resources.gifs.length : 0}</dd>
            </div>
          </dl>
        </article>

        <article className="development-domain-details-card">
          <strong>{copy.domainDetails.links}</strong>
          <dl className="development-domain-details-list">
            <div>
              <dt>{copy.domainDetails.landingPage}</dt>
              <dd>{item.landingPage || "-"}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.aboutPage}</dt>
              <dd>{item.aboutPage || "-"}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.contactPage}</dt>
              <dd>{item.contactPage || "-"}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.termsPage}</dt>
              <dd>{item.termsAndConditionsPage || "-"}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.heroImage}</dt>
              <dd>{resources.heroImage || "-"}</dd>
            </div>
            <div>
              <dt>{copy.domainDetails.favicon}</dt>
              <dd>{resources.favicon || "-"}</dd>
            </div>
          </dl>
        </article>
      </div>

      <article className="development-domain-details-card development-domain-timeline-card">
        <strong>{copy.domainDetails.activityTimeline}</strong>
        <div className="development-domain-timeline">
          {timeline.length ? timeline.map((event) => (
            <div key={event.key} className="development-domain-timeline-item">
              <div className="development-domain-timeline-dot" aria-hidden="true" />
              <div className="development-domain-timeline-copy">
                <div className="development-domain-timeline-row">
                  <strong>{event.title}</strong>
                  <span>{formatDateTime(event.timestamp, locale)}</span>
                </div>
                <span>{event.actor}</span>
                <p>{event.detail}</p>
              </div>
            </div>
          )) : (
            <p className="management-empty">{copy.domainDetails.noActivityHistory}</p>
          )}
        </div>
      </article>
    </section>
  );
}
