import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaCheckCircle, FaCopy, FaExclamationCircle, FaTimes } from "react-icons/fa";
import { io } from "socket.io-client";
import ToastNotice from "../../../shared/components/ToastNotice";
import { hasAnyPrivilege } from "../../../shared/utils/permissions";
import { getSocketBaseUrl } from "../../../shared/utils/socketBaseUrl";
import { useAuth } from "../../auth/hooks/useAuth";
import { getToken } from "../../auth/utils/authStorage";
import {
  getWaybackBatchApi,
  getWaybackBatchesApi,
  getWaybackResultsApi,
  submitWaybackDomainResultApi,
  takeWaybackDomainApi,
} from "../api/waybackCheckerApi";
import "../../../shared/styles/management.css";

const WAYBACK_CHECKER_ACCESS_PRIVILEGES = [
  "VIEW_WAYBACK_CHECKER",
  "DO_WAYBACK_CHECKER",
  "VIEW_EXPIRED_DOMAINS",
];

function formatBatchNumber(value) {
  return String(Math.max(1, Number(value) || 1)).padStart(2, "0");
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function getDomainStatusClassName(status) {
  if (status === "passed" || status === "failed") return "bg-sky-100 text-sky-800";
  if (status === "taken") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function isCompletedStatus(status) {
  return status === "passed" || status === "failed";
}

function getDomainStatusLabel(status) {
  if (isCompletedStatus(status)) return "Completed";
  if (status === "taken") return "Taken";
  return "Pending";
}

function getStatusLabel(status) {
  if (status === "passed") return "Passed";
  if (status === "failed") return "Failed";
  if (status === "taken") return "Taken";
  return "Pending";
}

function getDomainSortValue(status) {
  if (status === "pending" || status === "taken") return 1;
  if (isCompletedStatus(status)) return 2;
  return 3;
}

async function copyText(value) {
  const text = String(value || "").trim();

  if (!text) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildInitialDrafts(domains = []) {
  return domains.reduce((drafts, item) => {
    drafts[item.id] = {
      status: "",
      failReason: "",
    };
    return drafts;
  }, {});
}

function getUserId(user) {
  return String(user?.id || user?._id || "").trim();
}

function normalizeRealtimeDomain(item, currentUserId) {
  if (!item?.id) {
    return null;
  }

  const takenById = String(item.takenBy?.id || item.takenBy?._id || item.takenBy || "").trim();
  const isTakenByMe = Boolean(currentUserId && takenById && currentUserId === takenById);

  return {
    ...item,
    isTakenByMe,
    canTake: !takenById || isTakenByMe,
  };
}

export default function WaybackCheckerPage() {
  const { user } = useAuth();
  const realtimeRefreshTimerRef = useRef(null);
  const [batches, setBatches] = useState([]);
  const [currentBatchNumber, setCurrentBatchNumber] = useState(null);
  const [activeBatchNumber, setActiveBatchNumber] = useState(null);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [resultViewOpen, setResultViewOpen] = useState(false);
  const [resultStatus, setResultStatus] = useState("passed");
  const [resultItems, setResultItems] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const currentUserId = getUserId(user);
  const canUseWaybackRealtime = hasAnyPrivilege(user, WAYBACK_CHECKER_ACCESS_PRIVILEGES);

  const activeBatch = useMemo(
    () => batches.find((item) => Number(item.batchNumber) === Number(activeBatchNumber)) || null,
    [activeBatchNumber, batches]
  );
  const listedDomains = useMemo(
    () =>
      [...domains].sort(
        (left, right) =>
          getDomainSortValue(left.status) - getDomainSortValue(right.status)
          || String(left.domain || "").localeCompare(String(right.domain || ""))
      ),
    [domains]
  );
  const activeTakenDomain = useMemo(
    () => domains.find((item) => item.status === "taken" && item.isTakenByMe) || null,
    [domains]
  );

  const loadBatches = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError("");
      }
      const payload = await getWaybackBatchesApi();
      const items = payload.items || [];
      setBatches(items);
      setCurrentBatchNumber(payload.currentBatchNumber || null);
      setActiveBatchNumber((current) => {
        if (current && items.some((item) => Number(item.batchNumber) === Number(current))) {
          return current;
        }

        return payload.currentBatchNumber || items[0]?.batchNumber || null;
      });
    } catch (requestError) {
      if (!silent) {
        setError(getErrorMessage(requestError, "Failed to load WayBack batches"));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadBatchDomains = async (batchNumber = activeBatchNumber, { silent = false } = {}) => {
    if (!batchNumber) {
      setDomains([]);
      setDrafts({});
      return;
    }

    try {
      if (!silent) {
        setDomainsLoading(true);
        setError("");
      }
      const payload = await getWaybackBatchApi(batchNumber);
      const nextDomains = payload.domains || [];
      setDomains(nextDomains);
      setDrafts((current) => ({
        ...buildInitialDrafts(nextDomains),
        ...current,
      }));
    } catch (requestError) {
      if (!silent) {
        setError(getErrorMessage(requestError, "Failed to load WayBack domains"));
      }
    } finally {
      if (!silent) {
        setDomainsLoading(false);
      }
    }
  };

  const loadResults = async (status = resultStatus, batchNumber = activeBatchNumber) => {
    if (!batchNumber) {
      setResultItems([]);
      return;
    }

    try {
      setResultsLoading(true);
      setError("");
      const payload = await getWaybackResultsApi(batchNumber, status);
      setResultItems(payload.items || []);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load WayBack results"));
    } finally {
      setResultsLoading(false);
    }
  };

  useEffect(() => {
    void loadBatches();
  }, []);

  useEffect(() => {
    void loadBatchDomains(activeBatchNumber);
  }, [activeBatchNumber]);

  useEffect(() => {
    if (resultViewOpen) {
      void loadResults(resultStatus, activeBatchNumber);
    }
  }, [activeBatchNumber, resultStatus, resultViewOpen]);

  useEffect(() => {
    if (!canUseWaybackRealtime) {
      return undefined;
    }

    const token = getToken();

    if (!token) {
      return undefined;
    }

    const socket = io(`${getSocketBaseUrl()}/wayback-checker`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    const refreshFromRealtime = (payload = {}) => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }

      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;

        void loadBatches({ silent: true });

        const payloadBatchNumber = Number(payload.batchNumber || 0);
        const shouldRefreshActiveBatch =
          activeBatchNumber
          && (!payloadBatchNumber || payloadBatchNumber === Number(activeBatchNumber));

        if (shouldRefreshActiveBatch) {
          void loadBatchDomains(activeBatchNumber, { silent: true });
        }

        if (resultViewOpen && shouldRefreshActiveBatch) {
          void loadResults(resultStatus, activeBatchNumber);
        }
      }, 250);
    };

    const handleDomainUpdated = (payload = {}) => {
      const payloadBatchNumber = Number(payload.batchNumber || 0);
      const shouldUpdateActiveBatch =
        activeBatchNumber
        && (!payloadBatchNumber || payloadBatchNumber === Number(activeBatchNumber));

      if (shouldUpdateActiveBatch) {
        const realtimeDomain = normalizeRealtimeDomain(
          payload.domainItem || {
            id: payload.id,
            batchNumber: payload.batchNumber,
            domain: payload.domain,
            status: payload.status,
          },
          currentUserId
        );

        if (realtimeDomain) {
          setDomains((current) =>
            current.map((item) =>
              item.id === realtimeDomain.id
                ? normalizeRealtimeDomain({ ...item, ...realtimeDomain }, currentUserId)
                : item
            )
          );
        }
      }

      refreshFromRealtime(payload);
    };

    const handleForbidden = (payload = {}) => {
      setError(payload.message || "You do not have permission to receive WayBack checker live updates.");
      socket.disconnect();
    };

    socket.on("wayback-checker:changed", refreshFromRealtime);
    socket.on("wayback-checker:domain-updated", handleDomainUpdated);
    socket.on("wayback-checker:results-updated", refreshFromRealtime);
    socket.on("wayback-checker:forbidden", handleForbidden);

    return () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }

      socket.off("wayback-checker:changed", refreshFromRealtime);
      socket.off("wayback-checker:domain-updated", handleDomainUpdated);
      socket.off("wayback-checker:results-updated", refreshFromRealtime);
      socket.off("wayback-checker:forbidden", handleForbidden);
      socket.disconnect();
    };
  }, [activeBatchNumber, canUseWaybackRealtime, currentUserId, resultStatus, resultViewOpen]);

  const updateDomain = (updatedDomain) => {
    if (!updatedDomain?.id) {
      return;
    }

    setDomains((current) => current.map((item) => (item.id === updatedDomain.id ? updatedDomain : item)));
  };

  const handleTake = async (item) => {
    try {
      setBusyId(`${item.id}:take`);
      setError("");
      const updatedDomain = await takeWaybackDomainApi(item.id);
      updateDomain(updatedDomain);
      const copied = await copyText(updatedDomain?.domain || item.domain);
      setNotice(copied ? "Domain taken and copied." : "Domain taken. Copy was blocked by the browser.");
      await loadBatches();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to take domain"));
    } finally {
      setBusyId("");
    }
  };

  const setDraftValue = (domainId, patch) => {
    setDrafts((current) => ({
      ...current,
      [domainId]: {
        ...(current[domainId] || { status: "", failReason: "" }),
        ...patch,
      },
    }));
  };

  const handleSubmitResult = async (item) => {
    const draft = drafts[item.id] || {};
    const selectedStatus = draft.status;
    const failReason = String(draft.failReason || "").trim();

    if (!selectedStatus) {
      setError("Select Pass or Fail before submitting.");
      return;
    }

    if (selectedStatus === "failed" && !failReason) {
      setError("Type the fail reason before submitting.");
      return;
    }

    try {
      setBusyId(`${item.id}:submit`);
      setError("");
      const updatedDomain = await submitWaybackDomainResultApi(item.id, {
        status: selectedStatus,
        failReason,
      });
      updateDomain(updatedDomain);
      setDraftValue(item.id, { status: "", failReason: "" });
      setNotice(`${updatedDomain?.domain || item.domain} marked as Completed.`);
      await loadBatches();
      if (resultViewOpen) {
        await loadResults(resultStatus, activeBatchNumber);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to submit WayBack result"));
    } finally {
      setBusyId("");
    }
  };

  const handleOpenResults = () => {
    setResultStatus("passed");
    setResultViewOpen(true);
  };

  const handleCopyResults = async () => {
    const text = resultStatus === "failed"
      ? resultItems.map((item) => `${item.domain}${item.failReason ? ` - ${item.failReason}` : ""}`).join("\n")
      : resultItems.map((item) => item.domain).join("\n");
    const copied = await copyText(text);
    setNotice(copied ? `${getStatusLabel(resultStatus)} domains copied.` : "Copy failed. Your browser blocked clipboard access.");
  };

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>Wayback Checker</h1>
          <p>Take Nawala-passed domains, check WayBack manually, and submit pass or fail results.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="management-button-secondary" onClick={loadBatches} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className="management-button" onClick={handleOpenResults} disabled={!activeBatchNumber}>
            View
          </button>
        </div>
      </section>

      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice message={notice} onClose={() => setNotice("")} tone="success" />

      <section className="app-panel management-table">
        {batches.length ? (
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="WayBack batches">
            {batches.map((item) => {
              const isActive = Number(activeBatchNumber) === Number(item.batchNumber);
              const isCurrent = Number(currentBatchNumber) === Number(item.batchNumber);

              return (
                <button
                  key={item.batchNumber}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveBatchNumber(item.batchNumber)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-emerald-700 text-white shadow-sm"
                      : isCurrent
                        ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Batch {formatBatchNumber(item.batchNumber)}
                  {isCurrent ? <span className="ml-2 text-xs opacity-80">Current</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="management-empty">No WayBack batches yet.</p>
        )}

        {activeBatch ? (
          <div className="mb-4 grid gap-2 sm:grid-cols-5">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Total</p>
              <strong className="text-2xl text-slate-900">{activeBatch.total || 0}</strong>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Pending</p>
              <strong className="text-2xl text-slate-900">{activeBatch.pending || 0}</strong>
            </div>
            <div className="rounded-md bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase text-amber-700">Taken</p>
              <strong className="text-2xl text-amber-800">{activeBatch.taken || 0}</strong>
            </div>
            <div className="rounded-md bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase text-emerald-700">Passed</p>
              <strong className="text-2xl text-emerald-800">{activeBatch.passed || 0}</strong>
            </div>
            <div className="rounded-md bg-rose-50 p-3">
              <p className="text-xs font-semibold uppercase text-rose-700">Failed</p>
              <strong className="text-2xl text-rose-800">{activeBatch.failed || 0}</strong>
            </div>
          </div>
        ) : null}

        {domainsLoading ? (
          <p className="management-empty">Loading WayBack domains...</p>
        ) : null}

        {!domainsLoading && activeBatchNumber && !listedDomains.length ? (
          <p className="management-empty">No WayBack domains in this batch.</p>
        ) : null}

        {!domainsLoading && listedDomains.length ? (
          <div className="management-table-wrap">
            <table className="management-table-grid">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Taken By</th>
                  <th>WayBack Result</th>
                </tr>
              </thead>
              <tbody>
                {listedDomains.map((item) => {
                  const draft = drafts[item.id] || {};
                  const isCompleted = isCompletedStatus(item.status);
                  const isMine = item.isTakenByMe;
                  const isTakenByOther = item.takenBy && !isMine;
                  const isBlockedByOwnTakenDomain = Boolean(activeTakenDomain && activeTakenDomain.id !== item.id && !isMine);
                  const isTaking = busyId === `${item.id}:take`;
                  const isSubmitting = busyId === `${item.id}:submit`;
                  const failSelected = draft.status === "failed";
                  const canSubmit = isMine && draft.status && (!failSelected || String(draft.failReason || "").trim());
                  const takeLabel = isTaking
                    ? "Taking..."
                    : isMine
                      ? "Copy Again"
                      : isTakenByOther
                        ? "Taken"
                        : isBlockedByOwnTakenDomain
                          ? "Complete Current"
                          : "Take";

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong className="font-mono text-slate-900">{item.domain}</strong>
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getDomainStatusClassName(item.status)}`}>
                          {getDomainStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>
                        {item.takenBy ? (
                          <span className="text-sm text-slate-700">{item.takenBy.name || item.takenBy.email}</span>
                        ) : (
                          <span className="text-sm text-slate-500">-</span>
                        )}
                      </td>
                      <td>
                        {isCompleted ? (
                          <div className="flex flex-col gap-1 text-sm text-slate-700">
                            <span className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${
                              item.status === "passed" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              {getStatusLabel(item.status)}
                            </span>
                          </div>
                        ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="management-button-secondary"
                              disabled={Boolean(busyId) || isTakenByOther || isBlockedByOwnTakenDomain}
                              onClick={() => handleTake(item)}
                            >
                              {takeLabel}
                            </button>
                            {isMine ? (
                              <>
                                <button
                                  type="button"
                                  className={`rounded-md px-3 py-2 text-xs font-semibold ${
                                    draft.status === "passed"
                                      ? "bg-emerald-700 text-white"
                                      : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                  }`}
                                  onClick={() => setDraftValue(item.id, { status: "passed" })}
                                >
                                  Pass
                                </button>
                                <button
                                  type="button"
                                  className={`rounded-md px-3 py-2 text-xs font-semibold ${
                                    draft.status === "failed"
                                      ? "bg-rose-700 text-white"
                                      : "bg-rose-50 text-rose-800 hover:bg-rose-100"
                                  }`}
                                  onClick={() => setDraftValue(item.id, { status: "failed" })}
                                >
                                  Fail
                                </button>
                              </>
                            ) : null}
                          </div>
                          {isMine && failSelected ? (
                            <textarea
                              value={draft.failReason || ""}
                              onChange={(event) => setDraftValue(item.id, { failReason: event.target.value })}
                              placeholder="Type fail reason..."
                              className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                            />
                          ) : null}
                          {isMine ? (
                            <button
                              type="button"
                              className="management-button"
                              disabled={Boolean(busyId) || !canSubmit}
                              onClick={() => handleSubmitResult(item)}
                            >
                            {isSubmitting ? "Submitting..." : "Submit"}
                          </button>
                        ) : null}
                        </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {resultViewOpen ? (
        <div className="management-modal-backdrop is-centered wayback-results-backdrop" onClick={() => setResultViewOpen(false)}>
          <div className="management-modal app-panel wayback-results-modal" onClick={(event) => event.stopPropagation()}>
            <div className="wayback-results-modal-header">
              <div>
                <span className="wayback-results-eyebrow">Wayback Checker</span>
                <h2>Batch {formatBatchNumber(activeBatchNumber)} Results</h2>
                <p>
                  {resultStatus === "failed"
                    ? `${activeBatch?.failed || 0} failed domains`
                    : `${activeBatch?.passed || 0} passed domains`}
                </p>
              </div>
              <button
                type="button"
                className="wayback-results-close"
                onClick={() => setResultViewOpen(false)}
                aria-label="Close results"
                title="Close"
              >
                <FaTimes aria-hidden="true" />
              </button>
            </div>

            <div className="wayback-results-toolbar">
              <div className="wayback-results-tabs" role="tablist" aria-label="Wayback result type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={resultStatus === "passed"}
                  className={resultStatus === "passed" ? "is-active is-passed" : ""}
                  onClick={() => setResultStatus("passed")}
                >
                  <FaCheckCircle aria-hidden="true" />
                  <span>Passed</span>
                  <strong>{activeBatch?.passed || 0}</strong>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={resultStatus === "failed"}
                  className={resultStatus === "failed" ? "is-active is-failed" : ""}
                  onClick={() => setResultStatus("failed")}
                >
                  <FaExclamationCircle aria-hidden="true" />
                  <span>Failed</span>
                  <strong>{activeBatch?.failed || 0}</strong>
                </button>
              </div>

              <button type="button" className="wayback-results-copy" disabled={!resultItems.length} onClick={handleCopyResults}>
                <FaCopy aria-hidden="true" />
                <span>Copy {getStatusLabel(resultStatus)}</span>
              </button>
            </div>

            {resultsLoading ? (
              <p className="wayback-results-empty">Loading results...</p>
            ) : resultItems.length ? (
              <div className="wayback-results-table-wrap">
                <table className="wayback-results-table">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      {resultStatus === "failed" ? <th>Reason</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {resultItems.map((item) => (
                      <tr key={item.id}>
                        <td className="font-mono">{item.domain}</td>
                        {resultStatus === "failed" ? <td>{item.failReason || "-"}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="wayback-results-empty">No {resultStatus} domains yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
