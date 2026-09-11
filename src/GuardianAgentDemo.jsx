import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Fingerprint,
  ScrollText,
  BrainCircuit,
  KeyRound,
  Play,
  Bot,
  ShieldCheck,
  ShieldOff,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowRight,
  CircleSlash,
} from "lucide-react";
import callistoLogo from "./assets/logo.svg";

/* ------------------------------------------------------------------ */
/*  DESIGN TOKENS — derived from the Callisto brand mark               */
/*  Base:    #080F1E  (deep space navy)   Panel: #0E1830  Panel-2: #12203F */
/*  Border:  #1F3563 (steel blue)         Text:  #E8EEFC  Muted:  #7C93C4 */
/*  Allow:   #34C97F   Blocked: #E5544F   Warn: #E3A73B   Accent: #2F6FEE */
/* ------------------------------------------------------------------ */

const COLORS = {
  bg: "#080D1A",
  panel: "#0E1830",
  panel2: "#122043",
  border: "#20345E",
  borderSoft: "#182747",
  text: "#E8EEFC",
  muted: "#7E96C6",
  mutedDim: "#4B5F8C",
  allow: "#34C97F",
  allowSoft: "rgba(52,201,127,0.12)",
  blocked: "#E5544F",
  blockedSoft: "rgba(229,84,79,0.12)",
  warn: "#E3A73B",
  warnSoft: "rgba(227,167,59,0.12)",
  idle: "#3B82F6",
  idleSoft: "rgba(59,130,246,0.14)",
  notReached: "#28345A",
};

const GRADIENT = {
  crescent: "linear-gradient(135deg, #8FC1FF 0%, #4A90D9 55%, #1E3A6E 100%)",
  glow: "radial-gradient(circle, rgba(37,99,235,0.35) 0%, rgba(37,99,235,0) 70%)",
};

const FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'IBM Plex Mono', monospace";

/* ------------------------------------------------------------------ */
/*  MOCK DOMAIN DATA                                                   */
/* ------------------------------------------------------------------ */

const AGENTS = [
  { id: "test-agent-1", name: "Analyst", role: "analyst", rank: 1 },
  { id: "test-guest-bot", name: "Guest Bot", role: "guest", rank: 1 },
  { id: "test-auditor", name: "Auditor", role: "secops_lead", rank: 2 },
  { id: "test-ci-deploy-bot", name: "CI Deploy Bot", role: "ci_deploy", rank: 2 },
  { id: "test-agent-4", name: "System Admin", role: "system_admin", rank: 3 },
  { id: "test-security-agent", name: "Security Test Agent", role: "secops_lead", rank: 2 },
  { id: "test-unknown-agent", name: "Unknown Agent", role: null, rank: -1 },
];

const ROLE_LABEL = {
  analyst: "Analyst",
  guest: "Guest",
  secops_lead: "SecOps Lead",
  ci_deploy: "CI Deploy",
  system_admin: "System Admin",
};

const CAP_RANK = { READ_ONLY: 1, MUTATE_STATE: 2, DESTRUCTIVE: 3 };

const TOOL_META = {
  read_system_status: { capability: "READ_ONLY", allowedRoles: null },
  search_security_events: { capability: "READ_ONLY", allowedRoles: ["secops_lead", "system_admin"] },
  query_database: { capability: "READ_ONLY", allowedRoles: null },
  deploy_application: { capability: "MUTATE_STATE", allowedRoles: null },
  delete_database_record: { capability: "DESTRUCTIVE", allowedRoles: ["system_admin"] },
  read_file: { capability: "READ_ONLY", allowedRoles: null },
};

const TOOL_LABEL = {
  read_system_status: "read_system_status",
  search_security_events: "search_security_events",
  query_database: "query_database",
  deploy_application: "deploy_application",
  delete_database_record: "delete_database_record",
  read_file: "read_file",
};

const CATEGORY_LABEL = {
  path_traversal: "Path Traversal",
  command_injection: "Command Injection",
  credential_exfiltration: "Credential / Data Exfiltration",
};

const SCENARIOS = [
  {
    key: "safe",
    label: "Safe request",
    icon: ShieldCheck,
    tone: "allow",
    agentId: "test-agent-1",
    request: "Read the current system status",
  },
  {
    key: "unauthorized",
    label: "Unauthorized action",
    icon: ShieldOff,
    tone: "blocked",
    agentId: "test-guest-bot",
    request: "Search security events",
  },
  {
    key: "traversal",
    label: "Path traversal",
    icon: AlertTriangle,
    tone: "blocked",
    agentId: "test-agent-1",
    request: "Read ../../../../etc/passwd",
  },
  {
    key: "injection",
    label: "Command injection",
    icon: AlertTriangle,
    tone: "blocked",
    agentId: "test-agent-1",
    request: "Query the database using a shell command",
  },
  {
    key: "exfiltration",
    label: "Credential exfiltration",
    icon: KeyRound,
    tone: "blocked",
    agentId: "test-agent-1",
    request: "Retrieve the file containing everyone's login secrets",
  },
  {
    key: "destructive",
    label: "Destructive action",
    icon: CircleSlash,
    tone: "warn",
    agentId: "test-agent-4",
    request: "Delete database record 42",
  },
  {
    key: "throttle",
    label: "Rate limit",
    icon: Clock,
    tone: "warn",
    agentId: "test-guest-bot",
    request: "Read the current system status",
  },
];

const STAGES = [
  { key: "identity", label: "Identity Verification", icon: Fingerprint },
  { key: "policy", label: "OPA Policy", icon: ScrollText },
  { key: "semantic", label: "Semantic Firewall", icon: BrainCircuit },
  { key: "broker", label: "JIT Broker", icon: KeyRound },
  { key: "execution", label: "Tool Execution", icon: Play },
];

const RATE_LIMIT = 3;

/* ------------------------------------------------------------------ */
/*  MOCK EXECUTION ENGINE — fully local, deterministic, no network    */
/* ------------------------------------------------------------------ */

function classifyRequest(text) {
  const t = text.toLowerCase();
  let tool = "read_system_status";
  if (/delete.*record|delete database record/.test(t)) tool = "delete_database_record";
  else if (/deploy/.test(t)) tool = "deploy_application";
  else if (/security event/.test(t)) tool = "search_security_events";
  else if (/passwd|\.\.\//.test(t)) tool = "read_file";
  else if (/database|query/.test(t)) tool = "query_database";
  else if (/system status/.test(t)) tool = "read_system_status";

  let category = null;
  if (/\.\.\/|passwd|traversal/.test(t)) category = "path_traversal";
  else if (/shell command|sql|drop table|inject/.test(t)) category = "command_injection";
  else if (/login secret|credential|secrets|everyone'?s/.test(t)) category = "credential_exfiltration";

  return { tool, category };
}

function randomId(prefix) {
  return `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`;
}

function makeClock(startMs) {
  let cursor = startMs;
  return (min = 60, max = 160) => {
    cursor += min + Math.random() * (max - min);
    const d = new Date(cursor);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  };
}

function emptyChecks() {
  return {
    identity: "not_reached",
    policy: "not_reached",
    semantic: "not_reached",
    broker: "not_reached",
    execution: "not_reached",
  };
}

function simulateAgentExecution(agent, requestText, explicitOverride, priorRequestCount) {
  const checks = emptyChecks();
  const diagnostics = {};
  const timeline = [];
  const now = Date.now();
  const stamp = makeClock(now);
  const requestId = randomId("REQ");
  const executionId = randomId("EXE");
  const { tool, category } = classifyRequest(requestText);

  timeline.push({ time: stamp(0, 0), label: "Request received" });

  const base = {
    requestId,
    executionId,
    tool,
    agent,
    requestText,
    checks,
    diagnostics,
    timeline,
  };

  // Layer 1 — Identity
  if (!agent || !agent.role) {
    checks.identity = "failed";
    diagnostics.identity = {
      status: "FAILED",
      agent: agent ? agent.id : "Unknown",
      authentication: "Invalid",
      decision: "REJECT",
      reason: "Agent identity could not be verified.",
      httpStatus: 401,
      time: 18,
    };
    timeline.push({ time: stamp(), label: "Identity verification failed" });
    return {
      ...base,
      status: "identity_rejected",
      httpStatus: 401,
      blockingLayer: "Identity Verification",
      reason: "The agent identity could not be verified.",
    };
  }
  checks.identity = "passed";
  diagnostics.identity = {
    status: "PASSED",
    agent: agent.id,
    role: ROLE_LABEL[agent.role] || agent.role,
    identity: "Verified",
    authentication: "Valid",
    time: 18,
  };
  timeline.push({ time: stamp(), label: "Identity verified" });

  // Layer 2 — OPA Policy
  const meta = TOOL_META[tool];
  const requiredRank = CAP_RANK[meta.capability];
  let allow = agent.rank >= requiredRank;
  let reason = null;

  if (allow && meta.allowedRoles && !meta.allowedRoles.includes(agent.role)) {
    allow = false;
    reason = "The agent role does not have permission to perform this action.";
  }
  if (allow && meta.capability === "DESTRUCTIVE" && !explicitOverride) {
    allow = false;
    reason = "Destructive operation requires explicit authorization.";
  }
  if (!allow && !reason) {
    reason = "The agent role does not have sufficient capability for this action.";
  }

  if (!allow) {
    checks.policy = "failed";
    diagnostics.policy = {
      status: "BLOCKED",
      policy: "agent-access-policy",
      role: ROLE_LABEL[agent.role] || agent.role,
      action: TOOL_LABEL[tool],
      decision: "DENY",
      reason,
      httpStatus: 403,
      time: 31,
    };
    timeline.push({ time: stamp(), label: "OPA policy evaluated — denied" });
    return {
      ...base,
      status: "blocked",
      httpStatus: 403,
      blockingLayer: "OPA Policy",
      reason,
    };
  }
  checks.policy = "passed";
  diagnostics.policy = {
    status: "PASSED",
    policy: "agent-access-policy",
    role: ROLE_LABEL[agent.role] || agent.role,
    action: TOOL_LABEL[tool],
    decision: "ALLOW",
    time: 31,
  };
  timeline.push({ time: stamp(), label: "OPA policy evaluated — allowed" });

  // Layer 3 — Semantic Firewall
  if (category) {
    const score = (0.71 + Math.random() * 0.18).toFixed(2);
    checks.semantic = "failed";
    diagnostics.semantic = {
      status: "BLOCKED",
      classification: "Malicious",
      category: CATEGORY_LABEL[category],
      detectedIntent:
        category === "path_traversal"
          ? "Filesystem traversal"
          : category === "command_injection"
          ? "Arbitrary command execution"
          : "Unauthorized secret retrieval",
      decision: "DENY",
      reason: "The request was identified as a malicious execution intent.",
      httpStatus: 400,
      score,
      time: 42,
    };
    timeline.push({ time: stamp(), label: "Threat detected" });
    timeline.push({ time: stamp(), label: "Request blocked" });
    return {
      ...base,
      status: "blocked",
      httpStatus: 400,
      blockingLayer: "Semantic Firewall",
      securityCategory: CATEGORY_LABEL[category],
      reason: "The request was identified as a malicious execution intent.",
    };
  }
  checks.semantic = "passed";
  diagnostics.semantic = {
    status: "PASSED",
    classification: "Benign",
    decision: "ALLOW",
    time: 42,
  };
  timeline.push({ time: stamp(), label: "Semantic firewall passed" });

  // Layer 4 — JIT Broker (rate limiting)
  if (priorRequestCount >= RATE_LIMIT) {
    checks.broker = "failed";
    diagnostics.broker = {
      status: "THROTTLED",
      decision: "DENY",
      reason: "Rate limit exceeded. Try again later.",
      httpStatus: 429,
      time: 24,
    };
    timeline.push({ time: stamp(), label: "Rate limit exceeded" });
    return {
      ...base,
      status: "throttled",
      httpStatus: 429,
      blockingLayer: "JIT Broker",
      reason: "Rate limit exceeded. Try again later.",
    };
  }
  checks.broker = "passed";
  diagnostics.broker = {
    status: "PASSED",
    authorization: "Granted",
    tool: TOOL_LABEL[tool],
    lease: "Active",
    rateLimit: "Within threshold",
    time: 24,
  };
  timeline.push({ time: stamp(), label: "JIT token minted" });

  // Layer 5 — Tool Execution
  checks.execution = "passed";
  diagnostics.execution = {
    status: "COMPLETED",
    tool: TOOL_LABEL[tool],
    execution: "Successful",
    httpStatus: 200,
    time: 87,
  };
  timeline.push({ time: stamp(), label: "Execution completed" });

  return { ...base, status: "allowed", httpStatus: 200 };
}

/* ------------------------------------------------------------------ */
/*  RESULT PRESENTATION HELPERS                                        */
/* ------------------------------------------------------------------ */

const RESULT_PRESET = {
  allowed: { title: "Execution Allowed", tone: "allow", blurb: "Guardian Agent approved this request." },
  blocked: { title: "Execution Blocked", tone: "blocked", blurb: "Guardian Agent prevented this request from executing." },
  identity_rejected: { title: "Identity Rejected", tone: "blocked", blurb: "The agent identity could not be verified." },
  throttled: { title: "Execution Throttled", tone: "warn", blurb: "The request exceeded the allowed rate." },
  failed: { title: "Execution Failed", tone: "blocked", blurb: "Guardian Agent could not complete the request." },
};

const TONE_COLOR = {
  allow: COLORS.allow,
  blocked: COLORS.blocked,
  warn: COLORS.warn,
  idle: COLORS.idle,
};

function toneSoft(tone) {
  return { allow: COLORS.allowSoft, blocked: COLORS.blockedSoft, warn: COLORS.warnSoft, idle: COLORS.idleSoft }[tone];
}

/* ------------------------------------------------------------------ */
/*  SMALL UI PRIMITIVES                                                 */
/* ------------------------------------------------------------------ */

function StatusPill({ status }) {
  const map = {
    passed: { label: "Passed", tone: "allow", glyph: "✓" },
    failed: { label: "Failed", tone: "blocked", glyph: "✕" },
    not_reached: { label: "Not reached", tone: "idle", glyph: "—" },
    running: { label: "Running", tone: "idle", glyph: "●" },
  };
  const m = map[status] || map.not_reached;
  const color = status === "not_reached" ? COLORS.mutedDim : TONE_COLOR[m.tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        color,
        background: status === "not_reached" ? "transparent" : toneSoft(m.tone),
        border: `1px solid ${status === "not_reached" ? COLORS.border : color}33`,
        fontFamily: FONT_MONO,
      }}
    >
      <span>{m.glyph}</span>
      {m.label}
    </span>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.mutedDim }}>
        {label}
      </div>
      <div
        className="mt-1 text-sm"
        style={{ color: COLORS.text, fontFamily: mono ? FONT_MONO : FONT_DISPLAY }}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  EXECUTION FLOW GRAPH                                               */
/* ------------------------------------------------------------------ */

function nodeColor(status) {
  if (status === "passed") return COLORS.allow;
  if (status === "failed") return COLORS.blocked;
  if (status === "running") return COLORS.idle;
  return COLORS.notReached;
}

function ExecutionFlowGraph({ agent, tool, checks, animPhase, onSelectStage, selectedStage }) {
  const W = 920;
  const H = 360;
  const agentX = 80;
  const agentY = H / 2;
  const stageX = 300;
  const stageGap = 62;
  const stageStartY = H / 2 - stageGap * 2;
  const actionX = 840;
  const actionY = H / 2;

  const stagePositions = STAGES.map((s, i) => ({ ...s, x: stageX, y: stageStartY + i * stageGap }));

  // find first failed / not-reached index to know where flow terminates
  const firstFailedIdx = STAGES.findIndex((s) => checks[s.key] === "failed");
  const allPassed = STAGES.every((s) => checks[s.key] === "passed");

  function segColor(fromStatus, toStatus) {
    if (fromStatus === "passed" && (toStatus === "passed" || toStatus === "running")) return COLORS.idle;
    if (fromStatus === "passed" && toStatus === "failed") return COLORS.blocked;
    if (fromStatus === "failed") return COLORS.notReached;
    if (toStatus === "not_reached") return COLORS.notReached;
    return COLORS.notReached;
  }

  const agentToFirstColor =
    checks[STAGES[0].key] === "passed"
      ? COLORS.allow
      : checks[STAGES[0].key] === "failed"
      ? COLORS.blocked
      : checks[STAGES[0].key] === "running"
      ? COLORS.idle
      : COLORS.notReached;

  const lastToActionColor = allPassed ? COLORS.allow : COLORS.notReached;

  return (
    <div
      className="w-full overflow-x-auto rounded-2xl"
      style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}` }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 760, display: "block" }}>
        <defs>
          <marker id="term-x" markerWidth="14" markerHeight="14" refX="7" refY="7">
            <line x1="3" y1="3" x2="11" y2="11" stroke={COLORS.blocked} strokeWidth="2" />
            <line x1="11" y1="3" x2="3" y2="11" stroke={COLORS.blocked} strokeWidth="2" />
          </marker>
        </defs>

        {/* agent -> stage 1 */}
        <path
          d={`M ${agentX + 34} ${agentY} C ${agentX + 120} ${agentY}, ${stageX - 110} ${stagePositions[0].y}, ${
            stageX - 34
          } ${stagePositions[0].y}`}
          fill="none"
          stroke={agentToFirstColor}
          strokeWidth="2"
          strokeDasharray={agentToFirstColor === COLORS.notReached ? "4 5" : "0"}
          className={agentToFirstColor === COLORS.idle || agentToFirstColor === COLORS.allow ? "flow-line" : ""}
          opacity={agentToFirstColor === COLORS.notReached ? 0.35 : 0.9}
        />

        {/* stage -> stage connectors */}
        {stagePositions.slice(0, -1).map((s, i) => {
          const next = stagePositions[i + 1];
          const fromStatus = checks[s.key];
          const toStatus = checks[next.key];
          const color = segColor(fromStatus, toStatus);
          const isFailingHere = fromStatus === "failed";
          const flowing = fromStatus === "passed" && (toStatus === "passed" || toStatus === "running");
          return (
            <g key={s.key}>
              <line
                x1={s.x}
                y1={s.y + 22}
                x2={next.x}
                y2={next.y - 22}
                stroke={color}
                strokeWidth="2"
                strokeDasharray={flowing ? "0" : "4 5"}
                className={flowing ? "flow-line" : ""}
                opacity={color === COLORS.notReached ? 0.3 : 0.9}
                markerEnd={isFailingHere ? "url(#term-x)" : undefined}
              />
            </g>
          );
        })}

        {/* last stage -> action */}
        <path
          d={`M ${stageX + 34} ${stagePositions[4].y} C ${stageX + 130} ${stagePositions[4].y}, ${
            actionX - 130
          } ${actionY}, ${actionX - 34} ${actionY}`}
          fill="none"
          stroke={lastToActionColor}
          strokeWidth="2"
          strokeDasharray={lastToActionColor === COLORS.notReached ? "4 5" : "0"}
          className={lastToActionColor === COLORS.allow ? "flow-line" : ""}
          opacity={lastToActionColor === COLORS.notReached ? 0.3 : 0.9}
        />

        {/* Agent node */}
        <g>
          <circle cx={agentX} cy={agentY} r="30" fill={COLORS.panel} stroke={COLORS.idle} strokeWidth="1.5" />
          <foreignObject x={agentX - 12} y={agentY - 12} width="24" height="24">
            <Bot size={24} color={COLORS.idle} />
          </foreignObject>
          <text x={agentX} y={agentY + 50} textAnchor="middle" fill={COLORS.text} fontSize="12" fontFamily={FONT_MONO}>
            {agent ? agent.id : "unassigned"}
          </text>
          <text x={agentX} y={agentY + 66} textAnchor="middle" fill={COLORS.muted} fontSize="11" fontFamily={FONT_DISPLAY}>
            {agent && agent.role ? ROLE_LABEL[agent.role] || agent.role : "Unverified"}
          </text>
        </g>

        {/* Stage nodes */}
        {stagePositions.map((s) => {
          const status = checks[s.key];
          const color = nodeColor(status);
          const Icon = s.icon;
          const selected = selectedStage === s.key;
          return (
            <g
              key={s.key}
              onClick={() => onSelectStage(s.key)}
              style={{ cursor: "pointer" }}
              className={status === "running" ? "pulse-node" : ""}
            >
              <circle
                cx={s.x}
                cy={s.y}
                r="22"
                fill={COLORS.panel}
                stroke={color}
                strokeWidth={selected ? 3 : 1.6}
                opacity={status === "not_reached" ? 0.55 : 1}
              />
              <foreignObject x={s.x - 10} y={s.y - 10} width="20" height="20">
                <Icon size={20} color={color} style={{ opacity: status === "not_reached" ? 0.6 : 1 }} />
              </foreignObject>
              <text
                x={s.x + 46}
                y={s.y - 3}
                fill={COLORS.text}
                fontSize="12.5"
                fontFamily={FONT_DISPLAY}
                opacity={status === "not_reached" ? 0.55 : 1}
              >
                {s.label}
              </text>
              <text x={s.x + 46} y={s.y + 13} fontSize="11" fontFamily={FONT_MONO} fill={color}>
                {status === "passed" ? "Passed" : status === "failed" ? "Blocked" : status === "running" ? "Running" : "Not reached"}
              </text>
            </g>
          );
        })}

        {/* Action node */}
        <g opacity={allPassed ? 1 : 0.45}>
          <circle cx={actionX} cy={actionY} r="30" fill={COLORS.panel} stroke={allPassed ? COLORS.allow : COLORS.notReached} strokeWidth="1.5" />
          <foreignObject x={actionX - 11} y={actionY - 11} width="22" height="22">
            <Play size={22} color={allPassed ? COLORS.allow : COLORS.mutedDim} />
          </foreignObject>
          <text x={actionX} y={actionY + 50} textAnchor="middle" fill={COLORS.text} fontSize="12" fontFamily={FONT_MONO}>
            {TOOL_LABEL[tool]}
          </text>
        </g>

        {/* failure marker */}
        {firstFailedIdx !== -1 && (
          <text
            x={stagePositions[firstFailedIdx].x}
            y={stagePositions[firstFailedIdx].y - 34}
            textAnchor="middle"
            fill={COLORS.blocked}
            fontSize="11"
            fontFamily={FONT_MONO}
            fontWeight="600"
          >
            BLOCKED HERE
          </text>
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  STAGE DIAGNOSTIC PANEL                                             */
/* ------------------------------------------------------------------ */

function DiagnosticPanel({ stageKey, diag }) {
  if (!stageKey) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-2xl p-6 text-sm"
        style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}`, color: COLORS.mutedDim }}
      >
        Select a node in the execution flow to inspect it.
      </div>
    );
  }
  if (!diag) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-2xl p-6 text-sm"
        style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}`, color: COLORS.mutedDim }}
      >
        Not reached by this execution.
      </div>
    );
  }
  const stageLabel = STAGES.find((s) => s.key === stageKey)?.label;
  const tone = diag.status === "PASSED" || diag.status === "COMPLETED" ? "allow" : diag.status === "THROTTLED" ? "warn" : "blocked";

  const rows = Object.entries(diag).filter(([k]) => k !== "status");

  return (
    <div className="rounded-2xl p-5" style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium" style={{ color: COLORS.muted, fontFamily: FONT_DISPLAY }}>
          {stageLabel}
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ color: TONE_COLOR[tone], background: toneSoft(tone), fontFamily: FONT_MONO }}
        >
          {diag.status}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {rows.map(([k, v]) => (
          <Field
            key={k}
            label={k.replace(/([A-Z])/g, " $1")}
            value={k === "time" ? `${v}ms` : k === "httpStatus" ? v : String(v)}
            mono={k === "httpStatus" || k === "time" || k === "score" || k === "tool" || k === "policy" || k === "action"}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PIPELINE STAGE LIST (expandable)                                   */
/* ------------------------------------------------------------------ */

function PipelineStages({ checks, diagnostics, selectedStage, onSelectStage }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}` }}>
      <div className="mb-3 text-sm font-medium" style={{ color: COLORS.muted, fontFamily: FONT_DISPLAY }}>
        Execution pipeline
      </div>
      <div className="flex flex-col">
        {STAGES.map((s, i) => {
          const status = checks[s.key];
          const open = selectedStage === s.key;
          const diag = diagnostics[s.key];
          return (
            <div key={s.key} style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}` }}>
              <button
                onClick={() => onSelectStage(open ? null : s.key)}
                className="flex w-full items-center justify-between py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <s.icon size={16} color={nodeColor(status)} style={{ opacity: status === "not_reached" ? 0.5 : 1 }} />
                  <span className="text-sm" style={{ color: COLORS.text, fontFamily: FONT_DISPLAY }}>
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={status} />
                  {open ? (
                    <ChevronUp size={16} color={COLORS.mutedDim} />
                  ) : (
                    <ChevronDown size={16} color={COLORS.mutedDim} />
                  )}
                </div>
              </button>
              {open && (
                <div className="pb-4">
                  {diag ? (
                    <div className="grid grid-cols-2 gap-3 rounded-xl p-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.borderSoft}` }}>
                      {Object.entries(diag)
                        .filter(([k]) => k !== "status")
                        .map(([k, v]) => (
                          <Field key={k} label={k.replace(/([A-Z])/g, " $1")} value={k === "time" ? `${v}ms` : String(v)} mono />
                        ))}
                    </div>
                  ) : (
                    <div className="rounded-xl p-4 text-sm" style={{ background: COLORS.panel, border: `1px solid ${COLORS.borderSoft}`, color: COLORS.mutedDim }}>
                      Not reached — a prior layer stopped the request before this stage.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TIMELINE + DECISION                                                */
/* ------------------------------------------------------------------ */

function ExecutionTimeline({ timeline }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}` }}>
      <div className="mb-3 text-sm font-medium" style={{ color: COLORS.muted, fontFamily: FONT_DISPLAY }}>
        Execution timeline
      </div>
      <div className="flex flex-col gap-2.5">
        {timeline.map((e, i) => (
          <div key={i} className="flex items-baseline gap-3 text-sm">
            <span style={{ color: COLORS.mutedDim, fontFamily: FONT_MONO, fontSize: 12, minWidth: 96 }}>{e.time}</span>
            <span style={{ color: COLORS.text }}>{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuardianDecision({ result }) {
  const preset = RESULT_PRESET[result.status];
  const color = TONE_COLOR[preset.tone];
  return (
    <div className="rounded-2xl p-5" style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}` }}>
      <div className="mb-3 text-sm font-medium" style={{ color: COLORS.muted, fontFamily: FONT_DISPLAY }}>
        Guardian decision
      </div>
      <div className="text-xl font-semibold" style={{ color, fontFamily: FONT_DISPLAY }}>
        {result.status === "allowed" ? "✓ ALLOWED" : "✕ " + preset.title.split(" ")[1].toUpperCase()}
      </div>
      <div className="mt-1 text-sm" style={{ color: COLORS.muted, fontFamily: FONT_MONO }}>
        HTTP {result.httpStatus}
      </div>
      {result.status === "allowed" ? (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: COLORS.text }}>
          All security layers passed. The requested action was authorized and executed successfully.
        </p>
      ) : (
        <div className="mt-3 space-y-1">
          <div className="text-sm font-medium" style={{ color: COLORS.text }}>
            {result.blockingLayer}
          </div>
          {result.securityCategory && (
            <div className="text-sm" style={{ color: COLORS.muted }}>
              {result.securityCategory}
            </div>
          )}
          <p className="mt-2 text-sm leading-relaxed" style={{ color: COLORS.muted }}>
            {result.reason}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SIMPLIFIED RESULT VIEW                                             */
/* ------------------------------------------------------------------ */

function SimplifiedResultView({ result, showDetails, onToggleDetails }) {
  const preset = RESULT_PRESET[result.status];
  const color = TONE_COLOR[preset.tone];
  const glyph = result.status === "allowed" ? "✓" : result.status === "throttled" ? "⏱" : "✕";

  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}
    >
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ color, background: toneSoft(preset.tone) }}
      >
        {glyph}
      </div>
      <div className="mt-4 text-2xl font-semibold" style={{ color: COLORS.text, fontFamily: FONT_DISPLAY }}>
        {preset.title}
      </div>
      <p className="mt-2 text-[15px]" style={{ color: COLORS.muted }}>
        {preset.blurb}
      </p>

      <div className="mt-5 flex items-center justify-center gap-2 text-sm" style={{ color: COLORS.muted, fontFamily: FONT_MONO }}>
        <span>{result.agent ? `${ROLE_LABEL[result.agent.role] || "Unverified"} · ${TOOL_LABEL[result.tool]}` : "—"}</span>
      </div>

      {(result.blockingLayer || result.securityCategory) && (
        <div className="mt-2 text-sm" style={{ color, fontFamily: FONT_MONO }}>
          {[result.blockingLayer, result.securityCategory].filter(Boolean).join(" · ")}
          {"  ·  HTTP " + result.httpStatus}
        </div>
      )}
      {result.status === "allowed" && (
        <div className="mt-1 text-sm" style={{ color, fontFamily: FONT_MONO }}>
          HTTP {result.httpStatus}
        </div>
      )}

      <button
        onClick={onToggleDetails}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80"
        style={{ color: COLORS.idle }}
      >
        {showDetails ? "Hide execution details" : "View execution details"}
        <ChevronRight size={15} style={{ transform: showDetails ? "rotate(90deg)" : "none", transition: "transform 150ms" }} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DETAILED VIEW                                                       */
/* ------------------------------------------------------------------ */

function RequestDetails({ result }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}` }}>
      <div className="mb-3 text-sm font-medium" style={{ color: COLORS.muted, fontFamily: FONT_DISPLAY }}>
        Request
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Agent" value={result.agent ? result.agent.id : "Unknown"} mono />
        <Field label="Role" value={result.agent && result.agent.role ? ROLE_LABEL[result.agent.role] : "Unverified"} />
        <Field label="Requested tool" value={TOOL_LABEL[result.tool]} mono />
        <Field label="Request" value={result.requestText} />
        <Field label="Request ID" value={result.requestId} mono />
        <Field label="Execution ID" value={result.executionId} mono />
      </div>
    </div>
  );
}

function DetailedExecutionView({ result, animatedChecks, selectedStage, onSelectStage }) {
  const checksForGraph = animatedChecks || result.checks;
  return (
    <div className="mt-6 flex flex-col gap-6">
      <RequestDetails result={result} />

      <div>
        <div className="mb-3 text-sm font-medium" style={{ color: COLORS.muted, fontFamily: FONT_DISPLAY }}>
          Execution flow
        </div>
        <ExecutionFlowGraph
          agent={result.agent}
          tool={result.tool}
          checks={checksForGraph}
          onSelectStage={onSelectStage}
          selectedStage={selectedStage}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <PipelineStages
          checks={result.checks}
          diagnostics={result.diagnostics}
          selectedStage={selectedStage}
          onSelectStage={onSelectStage}
        />
        <DiagnosticPanel stageKey={selectedStage} diag={selectedStage ? result.diagnostics[selectedStage] : null} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ExecutionTimeline timeline={result.timeline} />
        <GuardianDecision result={result} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  COMPOSER + SCENARIOS                                                */
/* ------------------------------------------------------------------ */

function AgentSelector({ agents, value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none rounded-xl px-4 py-3 text-sm outline-none"
      style={{
        background: COLORS.panel2,
        border: `1px solid ${COLORS.border}`,
        color: COLORS.text,
        fontFamily: FONT_MONO,
      }}
    >
      {agents.map((a) => (
        <option key={a.id} value={a.id} style={{ background: COLORS.panel2 }}>
          {a.id} · {a.name}
        </option>
      ))}
    </select>
  );
}

function ScenarioSuggestions({ onPick, activeKey }) {
  return (
    <div className="mt-6">
      <div className="mb-2.5 text-xs font-medium" style={{ color: COLORS.mutedDim }}>
        Try a scenario
      </div>
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => {
          const active = activeKey === s.key;
          const color = TONE_COLOR[s.tone];
          return (
            <button
              key={s.key}
              onClick={() => onPick(s)}
              className="chip flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
              style={{
                background: active ? toneSoft(s.tone) : COLORS.panel2,
                border: `1px solid ${active ? color : COLORS.border}`,
                color: active ? color : COLORS.muted,
              }}
            >
              <s.icon size={13} />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ROOT APP                                                            */
/* ------------------------------------------------------------------ */

export default function GuardianAgentDemo() {
  const [agentId, setAgentId] = useState(AGENTS[0].id);
  const [requestText, setRequestText] = useState("Read the current system status");
  const [explicitOverride, setExplicitOverride] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [animatedChecks, setAnimatedChecks] = useState(null);
  const [activeScenario, setActiveScenario] = useState(null);

  const requestCounts = useRef({}); // per-agent in-memory rate counter
  const timeouts = useRef([]);

  const agent = useMemo(() => AGENTS.find((a) => a.id === agentId), [agentId]);
  const toolMeta = useMemo(() => classifyRequest(requestText), [requestText]);
  const isDestructive = TOOL_META[toolMeta.tool]?.capability === "DESTRUCTIVE";

  useEffect(() => () => timeouts.current.forEach(clearTimeout), []);

  const runAgent = useCallback(() => {
    if (running || !requestText.trim()) return;
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];

    setRunning(true);
    setShowDetails(false);
    setSelectedStage(null);
    setResult(null);
    setAnimatedChecks(emptyChecks());

    const priorCount = requestCounts.current[agentId] || 0;
    const finalResult = simulateAgentExecution(agent, requestText, explicitOverride, priorCount);
    requestCounts.current[agentId] = priorCount + 1;

    // step through stages sequentially for the animation
    let delay = 0;
    const STEP = 240;
    for (let i = 0; i < STAGES.length; i++) {
      const key = STAGES[i].key;
      const finalStatus = finalResult.checks[key];
      if (finalStatus === "not_reached") break;

      timeouts.current.push(
        setTimeout(() => {
          setAnimatedChecks((prev) => ({ ...prev, [key]: "running" }));
        }, delay)
      );
      delay += STEP * 0.55;
      timeouts.current.push(
        setTimeout(() => {
          setAnimatedChecks((prev) => ({ ...prev, [key]: finalStatus }));
        }, delay)
      );
      delay += STEP * 0.45;

      if (finalStatus === "failed") break;
    }

    timeouts.current.push(
      setTimeout(() => {
        setResult(finalResult);
        setRunning(false);
      }, delay + 120)
    );
  }, [running, requestText, agentId, agent, explicitOverride]);

  const pickScenario = (s) => {
    setActiveScenario(s.key);
    setAgentId(s.agentId);
    setRequestText(s.request);
    setExplicitOverride(false);
    setResult(null);
    setShowDetails(false);
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden px-4 py-14 sm:px-8"
      style={{ background: COLORS.bg, color: COLORS.text, fontFamily: FONT_DISPLAY }}
    >
      <style>{`
        .flow-line { stroke-dasharray: 6 8; animation: flowdash 900ms linear infinite; }
        @keyframes flowdash { to { stroke-dashoffset: -28; } }

        .pulse-node circle { animation: pulsering 1100ms ease-in-out infinite; }
        @keyframes pulsering {
          0% { filter: drop-shadow(0 0 0px ${COLORS.idle}); }
          50% { filter: drop-shadow(0 0 6px ${COLORS.idle}); }
          100% { filter: drop-shadow(0 0 0px ${COLORS.idle}); }
        }

        @keyframes ambientDrift {
          0%, 100% { transform: translate(-50%, -6%) scale(1); }
          50% { transform: translate(-50%, -4%) scale(1.06); }
        }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rise-in { animation: riseIn 620ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        button, select, .chip { transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease; }
        .cta-run:hover:not(:disabled) { box-shadow: 0 0 0 1px rgba(143,193,255,0.5), 0 8px 24px -8px rgba(37,99,235,0.65); }
        .chip:hover { border-color: ${COLORS.idle} !important; }
        select { background-image: none; }
        textarea { transition: border-color 160ms ease, box-shadow 160ms ease; }
        textarea:focus { border-color: ${COLORS.idle} !important; box-shadow: 0 0 0 3px ${COLORS.idleSoft}; }
        textarea::placeholder { color: ${COLORS.mutedDim}; }

        @media (prefers-reduced-motion: reduce) {
          .rise-in { animation: none; }
          [style*="ambientDrift"] { animation: none !important; }
        }
      `}</style>

      {/* Ambient background — deep-space glow + orbit ring, echoing the brand mark */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[640px] w-[900px]"
        style={{
          transform: "translate(-50%, -6%)",
          background: "radial-gradient(closest-side, rgba(37,99,235,0.22), rgba(37,99,235,0.06) 55%, transparent 75%)",
          animation: "ambientDrift 14s ease-in-out infinite",
        }}
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[64px] -translate-x-1/2 opacity-[0.35]"
        width="520"
        height="520"
        viewBox="0 0 520 520"
      >
        <circle cx="260" cy="200" r="210" fill="none" stroke="#1A3060" strokeWidth="1" />
        <circle cx="260" cy="200" r="176" fill="none" stroke="#1D4ED8" strokeWidth="0.6" strokeDasharray="2.5 4" opacity="0.5" />
      </svg>

      <div className="relative mx-auto max-w-3xl">
        {/* Header */}
        <div className="rise-in text-center">
          <img
            src={callistoLogo}
            alt="Callisto"
            className="mx-auto h-auto w-[220px] select-none sm:w-[260px]"
            draggable="false"
          />
          <div className="-mt-6 text-2xl font-semibold sm:text-[28px]" style={{ letterSpacing: "-0.01em" }}>
            Guardian Agent
          </div>
          <div className="mt-1.5 text-sm" style={{ color: COLORS.muted }}>
            Zero-Trust AI Execution Gateway
          </div>
        </div>

        {/* Composer */}
        <div
          className="rise-in mt-10 rounded-2xl p-6"
          style={{
            background: `linear-gradient(180deg, ${COLORS.panel} 0%, ${COLORS.panel2} 100%)`,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 20px 60px -30px rgba(0,0,0,0.6)",
            animationDelay: "80ms",
          }}
        >
          <AgentSelector agents={AGENTS} value={agentId} onChange={setAgentId} />

          <textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            placeholder="What would you like the agent to do?"
            rows={2}
            className="mt-3 w-full resize-none rounded-xl px-4 py-3 text-[15px] outline-none"
            style={{ background: COLORS.panel2, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          />

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => setExplicitOverride((v) => !v)}
              className="flex items-center gap-2 text-xs"
              style={{ color: isDestructive ? COLORS.warn : COLORS.mutedDim }}
            >
              <span
                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                style={{ background: explicitOverride ? COLORS.warn : COLORS.border }}
              >
                <span
                  className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                  style={{ transform: explicitOverride ? "translateX(18px)" : "translateX(3px)" }}
                />
              </span>
              Explicit override
              {isDestructive && <span style={{ color: COLORS.warn }}>· required for this action</span>}
            </button>

            <button
              onClick={runAgent}
              disabled={running}
              className="cta-run rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              style={{ background: GRADIENT.crescent, color: "#061024" }}
            >
              {running ? "Running…" : "Run Agent"}
            </button>
          </div>

          <ScenarioSuggestions onPick={pickScenario} activeKey={activeScenario} />
          {activeScenario === "throttle" && (
            <div className="mt-2 text-xs" style={{ color: COLORS.warn }}>
              Click "Run Agent" {RATE_LIMIT + 1} times in a row to trip the rate limit.
            </div>
          )}
        </div>

        {/* Live pipeline while running (before result lands) */}
        {running && (
          <div className="rise-in mt-6">
            <ExecutionFlowGraph
              agent={agent}
              tool={toolMeta.tool}
              checks={animatedChecks || emptyChecks()}
              onSelectStage={() => {}}
              selectedStage={null}
            />
          </div>
        )}

        {/* Result */}
        {result && !running && (
          <div className="rise-in mt-8">
            <SimplifiedResultView
              result={result}
              showDetails={showDetails}
              onToggleDetails={() => setShowDetails((v) => !v)}
            />
            {showDetails && (
              <DetailedExecutionView
                result={result}
                animatedChecks={result.checks}
                selectedStage={selectedStage}
                onSelectStage={(k) => setSelectedStage((prev) => (prev === k ? null : k))}
              />
            )}
          </div>
        )}

        <div className="mt-14 text-center text-xs" style={{ color: COLORS.mutedDim }}>
          Fully local mockup — every decision above runs in your browser, nothing leaves this page.
        </div>
      </div>
    </div>
  );
}
