import { useEffect, useMemo, useRef, useState } from 'react';
import {
  checkTrustPositifBulk,
  getBulkDomainCheck,
  startBulkDomainCheck,
  stopBulkDomainCheck,
} from "../api/rankCheckerApi";
import { submitMoneySiteNawalaBulkUpdateApi } from "../../money-sites/api/moneySitesApi";
import {
  getSerperAvailabilityAlertClassName,
  shouldHideDuplicateSerperError,
} from '../utils/serperAvailabilityUi';

const ACTIVE_RUN_STORAGE_KEY = 'bulk_domain_checker_run_id';
const DOMAINS_TEXT_STORAGE_KEY = 'bulk_domain_checker_domains_text';
const TRUST_POSITIF_URL = 'https://trustpositif.komdigi.go.id/';
const AUTO_BATCH_PROCESS_THRESHOLD = 20; // Automatically process batches when passed domains >= 20

const toCsv = (rows) => rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

const isTerminalStatus = (status) => status === 'completed' || status === 'stopped' || status === 'failed';
const getErrorMessage = (error, fallback) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;
const getScopedStorageKey = (baseKey, storageNamespace = '') => {
  const namespace = String(storageNamespace || '').trim();
  return namespace ? `${namespace}:${baseKey}` : baseKey;
};

const normalizeNawalaResultSelection = (status) => {
  if (status === 'ada') return 'blocked';
  if (status === 'tidak ada') return 'not_blocked';
  return '';
};

const createNawalaSelectionState = (batches = [], results = []) => {
  const selectionsByDomain = new Map(
    results.map((result) => [
      String(result?.domain || '').trim(),
      normalizeNawalaResultSelection(result?.status),
    ])
  );

  return batches.reduce((selectionState, batch = []) => {
  batch.forEach((domain) => {
    selectionState[domain] = selectionsByDomain.get(domain) || '';
  });

  return selectionState;
  }, {});
};

const getNawalaResultToneClassName = (status) => {
  if (status === 'ada') return 'bg-rose-100 text-rose-800';
  if (status === 'tidak ada') return 'bg-emerald-100 text-emerald-800';
  if (status === 'error') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
};

const buildNawalaBatchPayload = (plan = null, batchIndex = 0) => {
  const batch = plan?.batches?.[batchIndex] || [];
  const selections = plan?.resultSelections || {};
  const checkedAt = new Date().toISOString();

  return {
    scanId: plan?.scanId || `nawala-${Date.now()}`,
    batchId: plan?.batchId || `nawala-batch-${batchIndex + 1}-${Date.now()}`,
    batchNumber: batchIndex + 1,
    totalBatches: plan?.batches?.length || 1,
    isComplete: batchIndex + 1 === (plan?.batches?.length || 1),
    totalDomains: batch.length,
    results: batch.map((domain) => ({
      domain,
      checkedAt,
      scanResult: {
        isBlocked: selections[domain] === 'blocked',
        checkedAt,
      },
    })),
  };
};

function BulkDomainCheckerPanel({
  serperAvailability,
  serperAvailabilityLoading,
  onAvailabilityChange = () => {},
  initialDomainsText = '',
  initialDomainsKey = '',
  resetRunOnInitialDomains = false,
  storageNamespace = '',
  onMoveToNawalaChecking = null,
  onNawalaCheckComplete = null,
  moveToNawalaCheckingLabel = 'Nawala Checking',
  moveToNawalaCheckingDisabledReason = '',
  nawalaCheckingUrl = TRUST_POSITIF_URL,
}) {
  const activeRunStorageKey = getScopedStorageKey(ACTIVE_RUN_STORAGE_KEY, storageNamespace);
  const domainsTextStorageKey = getScopedStorageKey(DOMAINS_TEXT_STORAGE_KEY, storageNamespace);
  const domainsTextareaRef = useRef(null);
  const [domainsText, setDomainsText] = useState(() =>
    initialDomainsText ? String(initialDomainsText) : localStorage.getItem(domainsTextStorageKey) || ''
  );
  const [minResults, setMinResults] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [runId, setRunId] = useState('');
  const [runState, setRunState] = useState(null);
  const [movingToNawala, setMovingToNawala] = useState(false);
  const [submittingNawalaBatch, setSubmittingNawalaBatch] = useState(false);
  const [nawalaCheckingPlan, setNawalaCheckingPlan] = useState(null);

  const domainCount = useMemo(
    () =>
      domainsText
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter(Boolean).length,
    [domainsText]
  );

  const passedDomainsText = useMemo(
    () => (runState?.passed || []).map((item) => item.domain).join('\n'),
    [runState]
  );
  const passedDomains = useMemo(
    () => [...new Set((runState?.passed || []).map((item) => String(item?.domain || '').trim()).filter(Boolean))],
    [runState]
  );

  useEffect(() => {
    const savedRunId = localStorage.getItem(activeRunStorageKey) || '';
    if (savedRunId) {
      setRunId(savedRunId);
    }
  }, [activeRunStorageKey]);

  useEffect(() => {
    if (!initialDomainsKey && !initialDomainsText) {
      return;
    }

    const nextDomainsText = String(initialDomainsText || '');
    setDomainsText(nextDomainsText);
    localStorage.setItem(domainsTextStorageKey, nextDomainsText);

    window.requestAnimationFrame(() => {
      domainsTextareaRef.current?.focus();
      domainsTextareaRef.current?.setSelectionRange(nextDomainsText.length, nextDomainsText.length);
    });

    if (resetRunOnInitialDomains) {
      setLoading(false);
      setRunId('');
      setRunState(null);
      localStorage.removeItem(activeRunStorageKey);
    }
  }, [activeRunStorageKey, domainsTextStorageKey, initialDomainsKey, initialDomainsText, resetRunOnInitialDomains]);

  useEffect(() => {
    localStorage.setItem(domainsTextStorageKey, domainsText);
  }, [domainsText, domainsTextStorageKey]);

  useEffect(() => {
    if (!runId) return undefined;

    let timer = null;
    let cancelled = false;

    const poll = async () => {
      try {
        const payload = await getBulkDomainCheck(runId);
        if (cancelled) return;
        setRunState(payload);

        if (isTerminalStatus(payload.status)) {
          setLoading(false);
          if (payload.status === 'failed' && payload.error) {
            setError(payload.error);
          }
          return;
        }

        timer = setTimeout(poll, 1000);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        if (err?.response?.data?.serperAvailability) {
          onAvailabilityChange(err.response.data.serperAvailability);
        }
        setRunState(null);
        setRunId('');
        localStorage.removeItem(activeRunStorageKey);
        setError(getErrorMessage(err, 'Failed to fetch run status'));
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeRunStorageKey, onAvailabilityChange, runId]);

  const exportCsv = (list, filename) => {
    const csv = toCsv([
      ['Domain', 'Result Count', 'Status', 'Error'],
      ...list.map((item) => [item.domain, item.count, item.passed ? 'PASSED' : 'FAILED', item.error || '']),
    ]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyPassedDomains = async () => {
    if (!passedDomainsText) {
      setNotice('No passed domains to copy.');
      return;
    }

    try {
      await navigator.clipboard.writeText(passedDomainsText);
      setNotice('Passed domains copied to clipboard.');
    } catch {
      setNotice('Copy failed. Your browser blocked clipboard access.');
    }
  };

  const exportNawalaResultsCsv = () => {
    const rows = nawalaCheckingPlan?.trustPositifResults || [];

    if (!rows.length) {
      setNotice('No TrustPositif results to export.');
      return;
    }

    const csv = toCsv([
      ['Domain', 'Status', 'Blocked', 'Batch', 'Checked At', 'Source Status', 'Error'],
      ...rows.map((item) => [
        item.domain,
        item.label || item.status || '',
        item.blocked === true ? 'Yes' : item.blocked === false ? 'No' : '',
        item.batchNumber || '',
        item.checkedAt || '',
        item.sourceStatus || '',
        item.error || '',
      ]),
    ]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'trustpositif-results.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const runCheck = async () => {
    if (!domainsText.trim()) {
      setError('Please paste at least one domain.');
      return;
    }

    setError('');
    setNotice('');
    setLoading(true);
    try {
      const payload = await startBulkDomainCheck({
        domains: domainsText,
        minResults,
      });
      setRunState(payload);
      setRunId(payload.runId);
      localStorage.setItem(activeRunStorageKey, payload.runId);
    } catch (err) {
      if (err?.response?.data?.serperAvailability) {
        onAvailabilityChange(err.response.data.serperAvailability);
      }
      setLoading(false);
      setError(getErrorMessage(err, 'Failed to start bulk domain check.'));
    }
  };

  const stopRun = async () => {
    if (!runId) return;
    try {
      const payload = await stopBulkDomainCheck(runId);
      setRunState(payload);
      setNotice('Stop requested. The run will stop after current domain completes.');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to stop the run.'));
    }
  };

  const clearRun = () => {
    setRunId('');
    setRunState(null);
    setError('');
    setNotice('');
    setDomainsText('');
    setNawalaCheckingPlan(null);
    localStorage.removeItem(activeRunStorageKey);
    localStorage.removeItem(domainsTextStorageKey);
  };

  const copyNawalaBatch = async (batchIndex = 0) => {
    const batch = nawalaCheckingPlan?.batches?.[batchIndex] || [];

    if (!batch.length) {
      setNotice('No Nawala batch domains to copy.');
      return;
    }

    try {
      await navigator.clipboard.writeText(batch.join('\n'));
      setNotice(`Nawala batch ${batchIndex + 1} copied.`);
    } catch {
      setNotice('Copy failed. Your browser blocked clipboard access.');
    }
  };

  const autoSubmitAllBatches = async (plan) => {
    if (!plan?.batches?.length) {
      return;
    }

    try {
      const submittedBatchesArray = [];
      let completedCount = 0;
      const totalBatches = plan.batches.length;

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        try {
          const payload = buildNawalaBatchPayload(plan, batchIndex);
          await submitMoneySiteNawalaBulkUpdateApi(payload);
          submittedBatchesArray.push(batchIndex);
          completedCount += 1;
          
          // Update notice with progress
          setNotice(`Processing batch ${completedCount}/${totalBatches} (${plan.batches[batchIndex].length} domains)...`);
          
          // Small delay between batches to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (batchErr) {
          console.error(`Failed to submit batch ${batchIndex + 1}:`, batchErr);
          // Continue with next batch even if one fails
        }
      }

      // Update plan with all submitted batches
      setNawalaCheckingPlan((current) => {
        if (!current) return current;
        return {
          ...current,
          submittedBatches: submittedBatchesArray,
        };
      });

      const summary = plan.trustPositifSummary || {};
      setNotice(
        `✓ All ${totalBatches} batches processed! Results: ${summary.blocked || 0} blocked, ${summary.notBlocked || 0} not blocked, ${summary.unknown || 0} unknown, ${summary.errors || 0} errors.`
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to auto-process batches.'));
    }
  };

  const movePassedToNawalaChecking = async () => {
    if (!onMoveToNawalaChecking || !passedDomains.length) {
      return;
    }

    try {
      setMovingToNawala(true);
      setError('');
      const shouldAutoProcess = passedDomains.length >= AUTO_BATCH_PROCESS_THRESHOLD;
      setNotice(`Checking ${passedDomains.length} passed domain${passedDomains.length === 1 ? '' : 's'} with TrustPositif in batches of 5.`);
      const plan = await onMoveToNawalaChecking({
        domains: passedDomains,
        runState,
      });

      if (!plan?.batches?.length) {
        throw new Error('No passed domains found to move to Nawala checking.');
      }

      const domainsToCheck = plan.batches.flatMap((batch) => batch || []);
      const trustPositifPayload = await checkTrustPositifBulk({
        domains: domainsToCheck,
        batchSize: Math.min(5, Math.max(1, Number(plan.batchSize || 5))),
      });
      const checkedResults = trustPositifPayload?.results || [];
      const checkedSummary = trustPositifPayload?.summary || null;

      const nextPlan = {
        ...plan,
        currentBatchIndex: 0,
        resultSelections: createNawalaSelectionState(plan.batches, checkedResults),
        submittedBatches: [],
        targetUrl: plan.targetUrl || nawalaCheckingUrl,
        trustPositif: trustPositifPayload,
        trustPositifResults: checkedResults,
        trustPositifSummary: checkedSummary,
        autoProcess: shouldAutoProcess,
      };

      if (onNawalaCheckComplete) {
        await onNawalaCheckComplete({
          plan: nextPlan,
          trustPositifPayload,
          results: checkedResults,
          summary: checkedSummary,
          domains: domainsToCheck,
          runState,
        });
      } else {
        setNawalaCheckingPlan(nextPlan);
        
        // Auto-process all batches if threshold is met
        if (shouldAutoProcess) {
          setNotice(`Auto-processing ${plan.batches.length} batches of 5 domains...`);
          await autoSubmitAllBatches(nextPlan);
        } else {
          setNotice(
            `TrustPositif check complete: ${checkedSummary?.blocked || 0} blocked, ${checkedSummary?.notBlocked || 0} not blocked, ${checkedSummary?.unknown || 0} unknown, ${checkedSummary?.errors || 0} errors.`
          );
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to check domains with TrustPositif.'));
    } finally {
      setMovingToNawala(false);
    }
  };

  const updateNawalaSelection = (domain, value) => {
    setNawalaCheckingPlan((current) => {
      if (!current?.resultSelections) {
        return current;
      }

      return {
        ...current,
        resultSelections: {
          ...current.resultSelections,
          [domain]: value,
        },
      };
    });
  };

  const submitCurrentNawalaBatch = async () => {
    if (!nawalaCheckingPlan?.batches?.length) {
      return;
    }

    const currentBatchIndex = nawalaCheckingPlan.currentBatchIndex || 0;
    const batch = nawalaCheckingPlan.batches[currentBatchIndex] || [];
    const missingSelections = batch.filter((domain) => !nawalaCheckingPlan.resultSelections?.[domain]);

    if (missingSelections.length) {
      setError('Select a result for every domain in the current Nawala batch before saving.');
      return;
    }

    try {
      setSubmittingNawalaBatch(true);
      setError('');
      setNotice('');
      const payload = buildNawalaBatchPayload(nawalaCheckingPlan, currentBatchIndex);
      const response = await submitMoneySiteNawalaBulkUpdateApi(payload);
      const updatedResult = response?.data || response;
      const isComplete = Boolean(updatedResult?.isComplete);

      setNawalaCheckingPlan((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          submittedBatches: [...new Set([...(current.submittedBatches || []), currentBatchIndex])],
        };
      });
      setNotice(
        isComplete
          ? 'All Nawala batches have been saved in-app.'
          : `Batch ${currentBatchIndex + 1} saved. Move to the next batch when ready.`
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save Nawala batch results.'));
    } finally {
      setSubmittingNawalaBatch(false);
    }
  };

  const setNawalaBatchIndex = (nextIndex) => {
    setNawalaCheckingPlan((current) => {
      if (!current?.batches?.length) {
        return current;
      }

      return {
        ...current,
        currentBatchIndex: Math.min(
          current.batches.length - 1,
          Math.max(0, Number(nextIndex) || 0)
        ),
      };
    });
  };

  const status = runState?.status || '';
  const runInProgress = status === 'running' || status === 'pending' || loading;
  const isSerperBlocked = serperAvailability?.available === false;
  const displayError = shouldHideDuplicateSerperError(error, serperAvailability) ? '' : error;
  const currentKey = serperAvailability?.currentKey || null;
  const trackedRemainingCredits =
    currentKey?.trackedRemainingDisplay !== null && currentKey?.trackedRemainingDisplay !== undefined
      ? Number(currentKey.trackedRemainingDisplay)
      : null;
  const hasInsufficientRemainingCredits =
    !serperAvailabilityLoading &&
    !isSerperBlocked &&
    trackedRemainingCredits !== null &&
    domainCount > 0 &&
    domainCount > trackedRemainingCredits;
  const insufficientCreditsMessage = hasInsufficientRemainingCredits
    ? 'Remaining credit limit is less than the pasted domain count.'
    : '';
  const runDisabled =
    runInProgress ||
    !domainsText.trim() ||
    serperAvailabilityLoading ||
    isSerperBlocked ||
    hasInsufficientRemainingCredits;
  const remainingCreditsLabel =
    serperAvailabilityLoading
      ? 'Checking...'
      : currentKey?.trackedRemainingDisplay !== null && currentKey?.trackedRemainingDisplay !== undefined
        ? String(currentKey.trackedRemainingDisplay)
        : '-';
  const currentKeyLabel =
    currentKey?.name
      ? `Current Key: ${currentKey.name}`
      : '';

  const passedCount = runState?.passedCount || passedDomains.length || 0;
  const failedCount = runState?.failedCount || runState?.failed?.length || 0;
  const totalCount = runState?.total || 0;
  const currentCount = runState?.current || 0;
  const progressPct = totalCount ? Math.round((currentCount / totalCount) * 100) : 0;
  const currentNawalaBatchIndex = nawalaCheckingPlan?.currentBatchIndex || 0;
  const currentNawalaBatch = nawalaCheckingPlan?.batches?.[currentNawalaBatchIndex] || [];
  const currentNawalaBatchText = currentNawalaBatch.join('\n');
  const currentNawalaBatchSelections = nawalaCheckingPlan?.resultSelections || {};
  const currentNawalaBatchComplete = currentNawalaBatch.length > 0
    && currentNawalaBatch.every((domain) => Boolean(currentNawalaBatchSelections[domain]));
  const currentNawalaBatchSubmitted = (nawalaCheckingPlan?.submittedBatches || []).includes(currentNawalaBatchIndex);

  return (
    <section className="space-y-4 p-4 lg:p-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Bulk Domain Checker</h2>
              <p className="mt-1 text-xs text-slate-500">
                Remaining Credits: <span className="font-semibold text-slate-700">{remainingCreditsLabel}</span><br></br>
                {currentKeyLabel ? ` ${currentKeyLabel}` : ''}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${domainCount > 5000 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
              {domainCount} domains
            </span>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Domains</label>
              <textarea
                ref={domainsTextareaRef}
                value={domainsText}
                onChange={(e) => setDomainsText(e.target.value)}
                disabled={runInProgress}
                placeholder="Paste up to 5000 domains. One per line or comma separated."
                className="h-72 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Min indexed pages</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={minResults}
                  onChange={(e) => setMinResults(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={runCheck}
                disabled={runDisabled}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {runInProgress ? 'Running...' : 'Run Bulk Check'}
              </button>
              <button
                type="button"
                onClick={stopRun}
                disabled={!runInProgress || !runId}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={clearRun}
                disabled={runInProgress}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </div>

            {serperAvailabilityLoading ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Checking Serper API status...
              </p>
            ) : null}

            {isSerperBlocked ? (
              <p className={`rounded-md px-3 py-2 text-sm ${getSerperAvailabilityAlertClassName(serperAvailability)}`}>
                {serperAvailability?.message || 'Rank Checker is unavailable right now.'}
              </p>
            ) : null}

            {hasInsufficientRemainingCredits ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {insufficientCreditsMessage}
              </p>
            ) : null}

            {runState && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="mb-1 flex flex-wrap items-center gap-3">
                  <span className="font-semibold">Status: {status || 'pending'}</span>
                  <span>{currentCount}/{totalCount} processed</span>
                  <span>{progressPct}%</span>
                </div>
                {runState.activeDomain && <p className="font-mono text-xs text-slate-600">Now checking: {runState.activeDomain}</p>}
              </div>
            )}

            {displayError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{displayError}</p> : null}
            {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:h-[760px]">
            <div className="mb-4 grid gap-2 sm:grid-cols-4">
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                <p className="text-2xl font-bold text-slate-900">{totalCount}</p>
              </div>
              <div className="rounded-md bg-indigo-50 p-3">
                <p className="text-xs uppercase tracking-wide text-indigo-700">Processed</p>
                <p className="text-2xl font-bold text-indigo-700">{currentCount}</p>
              </div>
              <div className="rounded-md bg-emerald-50 p-3">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Passed</p>
                <p className="text-2xl font-bold text-emerald-700">{passedCount}</p>
              </div>
              <div className="rounded-md bg-rose-50 p-3">
                <p className="text-xs uppercase tracking-wide text-rose-700">Removed</p>
                <p className="text-2xl font-bold text-rose-700">{failedCount}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyPassedDomains}
                disabled={passedCount === 0}
                className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Copy Passed Domains
              </button>
              <button
                type="button"
                onClick={() => exportCsv([...(runState?.passed || []), ...(runState?.failed || [])], 'all-results.csv')}
                disabled={totalCount === 0}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export All CSV
              </button>
              <button
                type="button"
                onClick={() => exportCsv(runState?.passed || [], 'passed-domains.csv')}
                disabled={passedCount === 0}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export Passed CSV
              </button>
            </div>

            <div className="mb-4 max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live Results</p>
              <div className="space-y-1">
                {(runState?.recent || []).slice(-10).reverse().map((item) => (
                  <div key={`${item.domain}-${item.count}-${item.error || ''}`} className={`rounded px-2 py-1 text-xs ${item.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    <span className="font-mono">{item.domain}</span>
                    <span className="ml-2">{item.count} results</span>
                    {item.error ? <span className="ml-2">{item.error}</span> : null}
                  </div>
                ))}
                {(runState?.recent || []).length === 0 && <p className="text-xs text-slate-500">No results yet.</p>}
              </div>
            </div>

            <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-2">
              <ResultColumn title={`Passed (${passedCount})`} items={runState?.passed || []} tone="pass" />
              <ResultColumn title={`Removed (${failedCount})`} items={runState?.failed || []} tone="fail" />
            </div>
            {onMoveToNawalaChecking ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={movePassedToNawalaChecking}
                  disabled={runInProgress || passedDomains.length === 0 || movingToNawala || Boolean(moveToNawalaCheckingDisabledReason)}
                  title={moveToNawalaCheckingDisabledReason || undefined}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {movingToNawala ? 'Moving...' : moveToNawalaCheckingLabel}
                </button>
              </div>
            ) : null}

            {nawalaCheckingPlan?.batches?.length ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                {nawalaCheckingPlan.autoProcess && nawalaCheckingPlan.submittedBatches?.length === nawalaCheckingPlan.batches.length ? (
                  // Auto-processing complete - show all results summary
                  <div>
                    <div className="mb-4 rounded-md bg-white border border-emerald-300 p-3">
                      <p className="text-sm font-semibold text-emerald-900 mb-2">✓ All Batches Processed Successfully</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-md bg-emerald-50 p-2">
                          <p className="text-xs text-emerald-700 font-medium">Not Blocked</p>
                          <p className="text-lg font-bold text-emerald-900">{nawalaCheckingPlan.trustPositifSummary?.notBlocked || 0}</p>
                        </div>
                        <div className="rounded-md bg-rose-50 p-2">
                          <p className="text-xs text-rose-700 font-medium">Blocked</p>
                          <p className="text-lg font-bold text-rose-900">{nawalaCheckingPlan.trustPositifSummary?.blocked || 0}</p>
                        </div>
                        <div className="rounded-md bg-yellow-50 p-2">
                          <p className="text-xs text-yellow-700 font-medium">Unknown</p>
                          <p className="text-lg font-bold text-yellow-900">{nawalaCheckingPlan.trustPositifSummary?.unknown || 0}</p>
                        </div>
                        <div className="rounded-md bg-red-50 p-2">
                          <p className="text-xs text-red-700 font-medium">Errors</p>
                          <p className="text-lg font-bold text-red-900">{nawalaCheckingPlan.trustPositifSummary?.errors || 0}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm font-semibold text-emerald-900 mb-2">Batch Results ({nawalaCheckingPlan.batches.length} batches)</p>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {nawalaCheckingPlan.batches.map((batch, batchIndex) => (
                          <div key={`batch-${batchIndex}`} className="rounded-md border border-emerald-100 bg-white p-2">
                            <p className="text-xs font-semibold text-slate-700 mb-1">Batch {batchIndex + 1} ({batch.length} domains)</p>
                            <div className="space-y-1">
                              {batch.map((domain) => {
                                const result = nawalaCheckingPlan.trustPositifResults?.find(r => String(r?.domain || '').trim() === domain);
                                const status = result?.status || 'unknown';
                                const statusColor = status === 'ada' ? 'bg-rose-100 text-rose-800' : status === 'tidak ada' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700';
                                const statusLabel = status === 'ada' ? 'Blocked' : status === 'tidak ada' ? 'Not Blocked' : 'Unknown';
                                return (
                                  <div key={domain} className="flex items-center justify-between text-xs">
                                    <span className="font-mono text-slate-700">{domain}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor}`}>{statusLabel}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={clearRun}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 w-full"
                    >
                      Clear & Start Over
                    </button>
                  </div>
                ) : (
                  // Manual batch submission view
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">TrustPositif batches</p>
                        <p className="text-xs text-emerald-800">
                          Batch {currentNawalaBatchIndex + 1} of {nawalaCheckingPlan.batches.length} | {currentNawalaBatch.length} domains
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    5 max per batch
                  </span>
                </div>
                <div className="mb-3 space-y-3">
                  {currentNawalaBatch.map((domain) => (
                    <div key={domain} className="rounded-md border border-emerald-100 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-sm text-slate-800">{domain}</p>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                          {currentNawalaBatchSubmitted ? 'Submitted' : 'Needs result'}
                        </span>
                      </div>
                      <label className="mt-2 block text-xs font-medium text-slate-700">
                        Result
                      </label>
                      <select
                        value={currentNawalaBatchSelections[domain] || ''}
                        onChange={(event) => updateNawalaSelection(domain, event.target.value)}
                        disabled={currentNawalaBatchSubmitted || submittingNawalaBatch}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        <option value="">Select result</option>
                        <option value="blocked">Blocked</option>
                        <option value="not_blocked">Not Blocked</option>
                      </select>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyNawalaBatch(currentNawalaBatchIndex)}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Copy Batch
                  </button>
                  <button
                    type="button"
                    onClick={submitCurrentNawalaBatch}
                    disabled={submittingNawalaBatch || currentNawalaBatchSubmitted || !currentNawalaBatchComplete}
                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingNawalaBatch ? 'Saving...' : currentNawalaBatchSubmitted ? 'Submitted' : 'Submit Batch'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNawalaBatchIndex(currentNawalaBatchIndex - 1)}
                    disabled={currentNawalaBatchIndex <= 0}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setNawalaBatchIndex(currentNawalaBatchIndex + 1)}
                    disabled={currentNawalaBatchIndex >= nawalaCheckingPlan.batches.length - 1}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Results are saved directly in the app and synced to the money-sites checker status.
                </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
    </section>
  );
}

function ResultColumn({ title, items, tone }) {
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-md border ${tone === 'pass' ? 'border-emerald-200' : 'border-rose-200'}`}>
      <div className={`px-3 py-2 text-sm font-semibold ${tone === 'pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
        {title}
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No domains</p>
        ) : (
          items.map((item) => (
            <div key={item.domain} className="border-t border-slate-100 px-3 py-2 text-xs">
              <p className="truncate font-mono text-slate-800">{item.domain}</p>
              <p className="text-slate-500">
                {item.count} results
                {item.error ? ` | ${item.error}` : ''}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default BulkDomainCheckerPanel;
