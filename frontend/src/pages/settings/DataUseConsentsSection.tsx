import { useEffect, useState } from "react";
import { Eye, ScanSearch, SlidersHorizontal } from "lucide-react";
import { toast } from "react-hot-toast";
import { LIVE_MODE } from "../../lib/env";
import { dataUseConsentsApi, type ConsentScope, type ConsentsResponse } from "../../lib/qualityReview";

/**
 * Data-use consents (plan §5.4). The two quality-review opt-ins are saved
 * immediately and reverted if the save fails, so a toggle never shows a state
 * the server doesn't have. The BYOK consents are shown read-only next to them.
 * External human review is unavailable until the privacy review completes.
 */

const DEMO_STATE: ConsentsResponse = {
  policy_version: "demo",
  policy_versions: {},
  grantable: { ai_quality_review: true, human_quality_review: false },
  active: [],
  byok_auto_retry_max: 0,
  quality_review: { is_internal: false, external_adjudication_available: false },
  consents: [],
};

type Status = "loading" | "ready" | "saving" | "error";

export function DataUseConsentsSection() {
  const [state, setState] = useState<ConsentsResponse | null>(LIVE_MODE ? null : DEMO_STATE);
  const [status, setStatus] = useState<Status>(LIVE_MODE ? "loading" : "ready");

  useEffect(() => {
    if (!LIVE_MODE) return;
    let cancelled = false;
    dataUseConsentsApi
      .get()
      .then((data) => {
        if (cancelled) return;
        setState(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = new Set(state?.active ?? []);
  const humanAvailable = Boolean(state?.quality_review.external_adjudication_available);
  const humanStored = Boolean(
    state?.consents.some((c) => c.scope === "human_quality_review" && !c.revoked_at),
  );

  const setScope = async (scope: ConsentScope, next: boolean) => {
    if (!state) return;
    const previous = state;
    const nextActive = next
      ? Array.from(new Set([...state.active, scope]))
      : state.active.filter((s) => s !== scope);
    setState({ ...state, active: nextActive });
    if (!LIVE_MODE) {
      toast.success(next ? "Opt-in saved" : "Opt-in withdrawn");
      return;
    }
    setStatus("saving");
    try {
      if (next) {
        await dataUseConsentsApi.grant(scope, state.policy_versions[scope]);
      } else {
        await dataUseConsentsApi.revoke(scope);
      }
      setState(await dataUseConsentsApi.get());
      toast.success(next ? "Opt-in saved" : "Opt-in withdrawn");
    } catch (err: any) {
      setState(previous);
      toast.error(err?.response?.data?.detail || "Couldn't save this setting. Please try again.");
    } finally {
      setStatus("ready");
    }
  };

  const disabled = status !== "ready";

  return (
    <section
      id="settings-data-use"
      className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-accent" />
          Data use & quality reviews
        </h2>
        <p className="text-xs text-muted mt-1">
          Optional ways Forge may use your builds to check and improve its output quality. Each opt-in
          applies to builds you start afterwards; withdrawing takes effect immediately.
        </p>
        {status === "error" && (
          <p role="alert" className="text-[11px] text-warn mt-2">
            Couldn't load these settings. Refresh the page to try again.
          </p>
        )}
        {state?.quality_review.is_internal && (
          <p className="text-[11px] text-info mt-2">
            Your account is marked as internal: your builds can be reviewed under Forge's internal
            policy whatever you choose here.
          </p>
        )}
      </div>

      <div className="flex items-start justify-between gap-4 p-3.5 rounded-lg border border-border-soft bg-base/40">
        <div>
          <h3 id="ai-quality-review-heading" className="text-xs font-semibold text-ink flex items-center gap-2">
            <ScanSearch size={14} className="text-accent" />
            AI quality review
          </h3>
          <p id="ai-quality-review-description" className="text-[11px] text-muted mt-1">
            Allow an automated reviewer operated by Forge to check your builds for defects. Results are
            used only to measure and improve review quality and are never shown in your build or
            charged to you. Builds that use your own API key are reviewed only if you also allow
            platform processing of BYOK content.
          </p>
        </div>
        <input
          id="ai-quality-review-toggle"
          type="checkbox"
          aria-labelledby="ai-quality-review-heading"
          aria-describedby="ai-quality-review-description"
          checked={active.has("ai_quality_review")}
          disabled={disabled}
          onChange={(e) => setScope("ai_quality_review", e.target.checked)}
          className="h-4 w-4 mt-1 shrink-0 rounded text-accent focus:ring-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex items-start justify-between gap-4 p-3.5 rounded-lg border border-border-soft bg-base/40">
        <div>
          <h3 id="human-quality-review-heading" className="text-xs font-semibold text-ink flex items-center gap-2">
            <Eye size={14} className="text-accent" />
            Human quality review
            {!humanAvailable && (
              <span
                id="human-quality-review-unavailable"
                className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-panel-alt text-[10px] font-medium text-muted"
              >
                Not available yet
              </span>
            )}
          </h3>
          <p id="human-quality-review-description" className="text-[11px] text-muted mt-1">
            Allow Forge staff to look at short, redacted excerpts of your builds (around a flagged
            line, with secrets, emails and keys removed) to confirm review findings. Every access is
            logged and excerpts are deleted after 90 days.
            {!humanAvailable &&
              " Human review of customer builds is paused until Forge completes a privacy review, so this cannot be turned on yet."}
          </p>
        </div>
        <input
          id="human-quality-review-toggle"
          type="checkbox"
          aria-labelledby="human-quality-review-heading"
          aria-describedby="human-quality-review-description"
          checked={humanAvailable ? active.has("human_quality_review") : humanStored}
          disabled={disabled || (!humanAvailable && !humanStored)}
          onChange={(e) => setScope("human_quality_review", e.target.checked)}
          className="h-4 w-4 mt-1 shrink-0 rounded text-accent focus:ring-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
        <div className="p-3 rounded-lg border border-border-soft space-y-0.5">
          <dt className="font-semibold text-ink">Platform processing of BYOK content</dt>
          <dd id="consent-status-platform-model-processing" className="text-muted">
            {active.has("platform_model_processing") ? "Allowed" : "Not allowed"}
          </dd>
        </div>
        <div className="p-3 rounded-lg border border-border-soft space-y-0.5">
          <dt className="font-semibold text-ink">Automatic retries on your own key</dt>
          <dd id="consent-status-byok-auto-retry" className="text-muted">
            {active.has("byok_auto_retry") && state
              ? `Up to ${state.byok_auto_retry_max} per operation`
              : "Off"}
          </dd>
        </div>
      </dl>
      <p className="text-[11px] text-muted">Saved automatically.</p>
    </section>
  );
}
