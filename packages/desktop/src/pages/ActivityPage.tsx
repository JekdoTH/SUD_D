import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopActivityEventDto, DesktopApprovalRequestDto, SoloExpertReviewDto, PreH1PreparationReviewDto, PreH1NativeConsentReviewDto } from '@sud-d/contracts';

function toneBadge(tone: DesktopActivityEventDto['tone']): string {
  switch (tone) {
    case 'success': return 'badge-green';
    case 'warning': return 'badge-yellow';
    case 'error': return 'badge-red';
    case 'info': return 'badge-gray';
  }
}

export function ActivityPage(): React.ReactElement {
  const [events, setEvents] = useState<DesktopActivityEventDto[]>([]);
  const [approvals, setApprovals] = useState<DesktopApprovalRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [approvalMessage, setApprovalMessage] = useState('');
  const [respondingId, setRespondingId] = useState('');
  // Pin the first displayed review digest; background refresh must never silently swap authority.
  const seenReviewDigests = useRef(new Map<string, string>());
  const [staleReviews, setStaleReviews] = useState<ReadonlySet<string>>(new Set());
  const [preH1Review, setPreH1Review] = useState<PreH1PreparationReviewDto|null>(null);
  const [preH1Busy, setPreH1Busy] = useState(false);
  const [preH1Result, setPreH1Result] = useState('');
  const [preH1Reserved, setPreH1Reserved] = useState(false);
  const [nativeReview,setNativeReview]=useState<PreH1NativeConsentReviewDto|null>(null);
  const [nativeBusy,setNativeBusy]=useState(false);
  const [nativeMessage,setNativeMessage]=useState('');

  const refresh = useCallback(async (showLoading = true, explicitlyReReview = false) => {
    if (showLoading) setLoading(true);
    const [activityResult, approvalResult] = await Promise.all([
      window.sudD.activity.list({ limit: 100 }),
      window.sudD.approval.list({ limit: 50 }),
    ]);
    if (showLoading) setLoading(false);

    if (activityResult.ok) {
      setEvents(activityResult.value);
      setError('');
    } else {
      setError(activityResult.error.message);
    }

    if (approvalResult.ok) {
      if (explicitlyReReview) seenReviewDigests.current.clear();
      const stale = new Set<string>();
      for (const approval of approvalResult.value) {
        if (approval.capability !== 'solo_expert.smoke') continue;
        const next = approval.soloExpertReview?.reviewDigest;
        const initial = seenReviewDigests.current.get(approval.id);
        if (!next || (initial && initial !== next)) stale.add(approval.id);
        else if (!initial) seenReviewDigests.current.set(approval.id, next);
      }
      setStaleReviews(stale);
      setApprovals(approvalResult.value);
      setApprovalError('');
    } else {
      setApprovalError(approvalResult.error.message);
    }

  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(false); }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const respond = useCallback(async (approvalRequestId: string, decision: 'approve' | 'deny',
    shownReview?: SoloExpertReviewDto) => {
    setRespondingId(approvalRequestId);
    setApprovalMessage('');
    setApprovalError('');
    const result = await window.sudD.approval.respond({ approvalRequestId, decision,
      ...(shownReview ? {reviewDigest: shownReview.reviewDigest} : {}) });
    setRespondingId('');
    if (!result.ok) {
      setApprovalError(result.error.message);
      await refresh(false);
      return;
    }
    setApprovalMessage(result.value.message);
    await refresh(false);
  }, [refresh]);


  const reviewFixedPreH1 = useCallback(async () => {
    setPreH1Busy(true);
    const result=await window.sudD.approval.preH1Review();
    setPreH1Busy(false);
    if(result.ok){setPreH1Review(result.value);setPreH1Result('Review this complete Mission binding before requesting manual Approval.');}
    else {setPreH1Review(null);setPreH1Result(result.error.message);}
  },[]);
  const requestFixedPreH1 = useCallback(async () => {
    setPreH1Busy(true);
    const result=await window.sudD.approval.preH1Request();
    setPreH1Busy(false);
    if(!result.ok){setPreH1Result(result.error.message);return;}
    if(result.value.state==='reserved'){
      setPreH1Reserved(true);
      setPreH1Result('One fixed Mission reserved. No Native execution is authorized or started.');
    }else if(result.value.state==='pending'){
      setPreH1Result('Owner Approval pending in Activity. Review the exact SHA and all scope fields below before approving; then click Complete preparation.');
    }else setPreH1Result('Preparation blocked: '+result.value.code);
    await refresh(false);
  },[refresh]);
  const cancelFixedPreH1 = useCallback(async () => {
    setPreH1Busy(true);
    const result=await window.sudD.approval.preH1Cancel();
    setPreH1Busy(false);
    if(result.ok){setPreH1Reserved(false);setPreH1Result('Unused Mission reservation settled and closed without Native execution.');}
    else setPreH1Result(result.error.message);
    await refresh(false);
  },[refresh]);

  const reviewNative=useCallback(async()=>{
    setNativeBusy(true);
    const r=await window.sudD.approval.preH1NativeReview();
    setNativeBusy(false);
    if(r.ok){setNativeReview(r.value);setNativeMessage('Verify every frozen hash and the separate Native scope BEFORE requesting Owner approval.');}
    else{setNativeReview(null);setNativeMessage(r.error.message);}
  },[]);
  const requestNative=useCallback(async()=>{
    setNativeBusy(true);
    const r=await window.sudD.approval.preH1NativeRequest();
    setNativeBusy(false);
    if(!r.ok){setNativeMessage(r.error.message);return;}
    setNativeMessage(r.value.state==='recorded'
      ? 'Separate Owner Native consent recorded. NO Runner or Guardian was started.'
      :r.value.state==='pending'
        ? 'Pending separate NATIVE Approval. Review every exact binding below, approve in Activity, then click Complete Native consent.'
        :'Native consent blocked: '+r.value.code);
    await refresh(false);
  },[refresh]);

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">Review protected actions and recent local security-relevant events.</p>
        </div>
        <button id="btn-refresh-activity" className="btn btn-ghost" onClick={() => void refresh(true, true)} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <section className="card approval-card" aria-label="PRE-H1 preparation">
        <div className="card-header-row">
          <div>
            <div className="card-heading">PRE-H1 — one-use Mission preparation</div>
            <p className="card-description">Desktop-owned, preparation only. No permission to launch Electron Diagnostic, Runner, Guardian or Native APIs.</p>
          </div>
        </div>
        <div className="activity-details">
          <button type="button" className="btn btn-ghost" disabled={preH1Busy || preH1Reserved}
            onClick={() => void reviewFixedPreH1()}>Review fixed Mission</button>
          {preH1Review && !preH1Reserved && <button type="button" className="btn btn-primary" disabled={preH1Busy}
            onClick={() => void requestFixedPreH1()}>Request / Complete manual approval</button>}
          {preH1Reserved && <button type="button" className="btn btn-ghost" disabled={preH1Busy}
            onClick={() => void cancelFixedPreH1()}>Cancel unused reservation</button>}
        </div>
        {preH1Review && <div className="activity-details" aria-label="Exact PRE-H1 Mission scope">
          <strong>Preparation only — NO Native execution</strong>
          {Object.entries(preH1Review.mission).map(([name,value])=>
            <div key={name} style={{overflowWrap:'anywhere'}}><strong>{name}:</strong> <code>{String(value)}</code></div>)}
          <div><strong>attemptId:</strong> <code>{preH1Review.attemptId}</code></div>
          <div style={{overflowWrap:'anywhere'}}><strong>Mission SHA-256 binding:</strong> <code>{preH1Review.missionBindingDigest}</code></div>
        </div>}
        {preH1Result && <p role="status">{preH1Result}</p>}
      </section>

      <section className="card approval-card" aria-label="PRE-H1 separate Native Owner consent">
        <div className="card-header-row"><div>
          <div className="card-heading">PRE-H1 — separate one-use Native authorization</div>
          <p className="card-description">Not Mission preparation. No Native process starts by Review, Request, Approve or Complete. Approval expires with the four-minute Mission.</p>
        </div></div>
        <div className="activity-details">
          <button type="button" className="btn btn-ghost" disabled={nativeBusy} onClick={()=>void reviewNative()}>Review separate Native scope</button>
          {nativeReview&&<button type="button" className="btn btn-primary" disabled={nativeBusy} onClick={()=>void requestNative()}>Request / Complete Native consent</button>}
        </div>
        {nativeReview&&<div className="activity-details" aria-label="Exact Native authorization scope">
          <strong>ONE synthetic run, 30 seconds, zero retries, NO-STAGE, NO network. This action records consent ONLY.</strong>
          {Object.entries(nativeReview).filter(([key])=>key!=='artifacts').map(([key,value])=>
            <div key={key} style={{overflowWrap:'anywhere'}}><strong>{key}:</strong> <code>{String(value)}</code></div>)}
          {Object.entries(nativeReview.artifacts).map(([key,value])=>
            <div key={key} style={{overflowWrap:'anywhere'}}><strong>{key}:</strong> <code>{value}</code></div>)}
        </div>}
        {nativeMessage&&<p role="status">{nativeMessage}</p>}
      </section>

      <section className="card approval-card">
        <div className="card-header-row">
          <div>
            <div className="card-kicker">Pending approvals</div>
            <div className="card-heading">Protected actions waiting for you</div>
            <p className="card-description">Approve or deny one exact action. Approval is one-time; retry the action from the connected AI after approving.</p>
          </div>
          <span className="badge badge-yellow">{approvals.length} pending</span>
        </div>

        {approvalError && (
          <div className="callout callout-error" role="alert">
            <strong>Approvals unavailable</strong>
            <span>{approvalError}</span>
          </div>
        )}
        {approvalMessage && (
          <div className="callout callout-info" role="status">
            <span>{approvalMessage}</span>
          </div>
        )}

        {loading && approvals.length === 0 ? (
          <div className="empty-state">Loading approvals…</div>
        ) : approvals.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>No pending approvals</strong>
            <span>Protected actions that need your decision will appear here.</span>
          </div>
        ) : (
          <div className="approval-list">
            {approvals.map((approval) => {
              const busy = respondingId === approval.id;
              const isSolo = approval.capability === 'solo_expert.smoke';
              const reviewed = approval.soloExpertReview;
              const stale = isSolo && (!reviewed || staleReviews.has(approval.id)
                || Date.parse(reviewed.expiresAt) <= Date.now());
              return (
                <div className="approval-row" key={approval.id}>
                  <div className="approval-context">
                    <strong>{approval.title}</strong>
                    {isSolo && reviewed && <div className="activity-details"
                      aria-label="Exact reviewed Solo Expert command and risk">
                      <strong>One-use reviewed host-user command — manual approval only</strong>
                      <div><strong>Fixed command:</strong> <code>{reviewed.command}</code></div>
                      <div><strong>Workspace:</strong> {reviewed.workspaceId}</div>
                      <div><strong>Verified review root:</strong> <code style={{overflowWrap:'anywhere'}}>{reviewed.canonicalRoot}</code></div>
                      <div><strong>Workspace generation:</strong> <code>{reviewed.workspaceGeneration}</code></div>
                      <div><strong>Profile / revision:</strong> {reviewed.profileId} / {reviewed.profileRevision}</div>
                      <div><strong>Session:</strong> {reviewed.sessionType} — {reviewed.sessionId}</div>
                      <div><strong>Gateway / managed epoch:</strong> {reviewed.gatewayEpoch} / {reviewed.managedEpoch}</div>
                      <div><strong>Observed device:</strong> {reviewed.deviceLabel} ({reviewed.provenance}; NOT an attestation)</div>
                      <div><strong>Observed account:</strong> {reviewed.accountLabel} ({reviewed.provenance}; NOT an attestation)</div>
                      <div><strong>Host risks:</strong> {reviewed.riskDisclosure}</div>
                      <div><strong>Local stock logs:</strong> Serena may retain raw arguments, stdout, stderr, results and errors locally.
                        The Windows user retains filesystem/network privileges. This is NOT a sandbox or no-egress guarantee.</div>
                      <div><strong>Descendants:</strong> response timeout is not an OS process stop; descendants may persist.</div>
                      <div><strong>Calls / retries:</strong> {reviewed.maxCalls} / {reviewed.maxRetries}</div>
                      <div><strong>Issued:</strong> {reviewed.issuedAt}</div>
                      <div><strong>Expires:</strong> {reviewed.expiresAt}</div>
                      <div style={{overflowWrap:'anywhere'}}><strong>Displayed immutable review SHA-256:</strong> <code>{reviewed.reviewDigest}</code></div>
                      {stale && <p role="alert">Review expired or changed. Approve and Deny are unavailable.
                        Explicitly Refresh to review the new scope; never reuse this digest.</p>}
                    </div>}
                    {isSolo && !reviewed && <div role="alert" className="activity-details">
                      Reviewed scope unavailable. No Solo Expert approval is permitted.
                    </div>}
                    {approval.capability === 'team.start' && <div className="approval-resource">Request: {approval.id.slice(0, 8)} — approve only if you requested Team Mode in your chat.</div>}
                    {approval.resourceLabel && <div className="approval-resource" style={{overflowWrap:'anywhere'}}>{approval.resourceLabel}</div>}
                    {approval.preH1Review && <div className="activity-details" aria-label="Verified Mission fields for manual Owner Approval">
                      <strong>PREPARATION ONLY — this approval does NOT authorize Native Runner execution</strong>
                      {Object.entries(approval.preH1Review.mission).map(([name,value])=>
                        <div key={name} style={{overflowWrap:'anywhere'}}><strong>{name}:</strong> <code>{String(value)}</code></div>)}
                      <div><strong>attemptId:</strong> <code>{approval.preH1Review.attemptId}</code></div>
                      <div style={{overflowWrap:'anywhere'}}><strong>Mission SHA-256 binding:</strong> <code>{approval.preH1Review.missionBindingDigest}</code></div>
                    </div>}
                    {approval.preH1NativeReview&&<div className="activity-details" aria-label="Verified separate Native Owner Approval scope">
                      <strong>NATIVE CONSENT ONLY — SECOND independent manual Owner approval; no Runner starts here</strong>
                      {Object.entries(approval.preH1NativeReview).filter(([key])=>key!=='artifacts').map(([key,value])=>
                        <div key={key} style={{overflowWrap:'anywhere'}}><strong>{key}:</strong> <code>{String(value)}</code></div>)}
                      {Object.entries(approval.preH1NativeReview.artifacts).map(([key,value])=>
                        <div key={key} style={{overflowWrap:'anywhere'}}><strong>{key}:</strong> <code>{value}</code></div>)}
                    </div>}
                    <div className="activity-details">
                      <span>Capability: {approval.capability}</span>
                      <span>Effect: {approval.effect}</span>
                      <span>Sensitivity: {approval.sensitivity}</span>
                      <span>Expires: {new Date(approval.expiresAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <div className="approval-actions">
                    <button
                      id={`btn-deny-approval-${approval.id}`}
                      className="btn btn-danger"
                      disabled={busy || !!stale}
                      onClick={() => void respond(approval.id, 'deny', reviewed)}
                    >
                      Deny
                    </button>
                    <button
                      id={`btn-approve-approval-${approval.id}`}
                      className="btn btn-primary"
                      disabled={busy || !!stale}
                      onClick={() => void respond(approval.id, 'approve', reviewed)}
                    >
                      {busy ? 'Working…' : 'Approve'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {error && (
        <div className="callout callout-error" role="alert">
          <strong>Activity unavailable</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="card">
        <div className="card-header-row">
          <div>
            <div className="card-kicker">Audit Activity</div>
            <div className="card-heading">Recent events</div>
          </div>
          <span className="badge badge-gray">{events.length} shown</span>
        </div>

        {loading && events.length === 0 ? (
          <div className="empty-state">Loading activity…</div>
        ) : events.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>No activity yet</strong>
            <span>Real lifecycle and audit events will appear here after they occur.</span>
          </div>
        ) : (
          <div className="activity-list">
            {events.map((event) => (
              <div className="activity-row" key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <div className="muted small">{new Date(event.timestamp).toLocaleString()}</div>
                  {event.details.length > 0 && (
                    <div className="activity-details">
                      {event.details.map((detail) => (
                        <span key={`${event.id}-${detail.label}`}>{detail.label}: {detail.value}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="activity-result">
                  <span className={`badge ${toneBadge(event.tone)}`}>{event.resultCode}</span>
                  <span className="muted small">{event.category}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
