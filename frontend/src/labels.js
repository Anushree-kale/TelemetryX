/** Product copy — professional, clear, enterprise-aligned */

export const APP_TAGLINE =
  "Repository intelligence for technical debt, change risk, and prioritized remediation";

export const PANELS = [
  { id: "overview", icon: "home", label: "Overview", hint: "Executive summary" },
  { id: "fixes", icon: "ticket", label: "Remediation", hint: "Jira-ready work items" },
  { id: "charts", icon: "chart", label: "Metrics", hint: "Trends and complexity" },
  { id: "heatmap", icon: "grid", label: "Heatmap", hint: "Risk by file" },
  { id: "failure", icon: "alert-triangle", label: "Failure risk", hint: "LSTM risk scores" },
  { id: "files", icon: "folder", label: "Modules", hint: "Detailed file table" },
  { id: "graph", icon: "graph", label: "Dependencies", hint: "Import graph" },
  { id: "clusters", icon: "cluster", label: "Clusters", hint: "Related modules" },
  { id: "cochange", icon: "link", label: "Co-change", hint: "Coupled edits" },
];

export const PANEL_TITLES = {
  overview: "Overview",
  fixes: "Remediation plan",
  charts: "Metrics & trends",
  heatmap: "Technical debt heatmap",
  failure: "Failure risk prediction",
  files: "Module inventory",
  graph: "Dependency graph",
  clusters: "Module clusters",
  cochange: "Co-change analysis",
};

export const COLUMN_LABELS = {
  file_path: "File & summary",
  debt_score: "Debt score",
  risk_level: "Risk level",
  priority_score: "Priority",
  unique_author_count: "Contributors",
  top_author_pct: "Top contributor %",
  bug_fix_ratio: "Bug-fix ratio",
  days_since_last_commit: "Days since change",
  downstream_count: "Downstream impact",
  out_degree: "Dependencies",
  betweenness: "Centrality",
  churn_90d: "Churn (90d)",
  lines_of_code: "LOC",
  test_coverage_ratio: "Test file ratio",
  roi_days: "Est. effort (days)",
  cyclomatic_complexity: "Complexity",
};

export const GLOSSARY = {
  file_path: "Source file path with a narrative summary of risk drivers.",
  debt_score:
    "0–100 model score: higher values indicate greater rework risk and change difficulty.",
  risk_level: "Risk band (high / medium / low) derived from debt score thresholds.",
  priority_score: "Recommended remediation order based on impact and effort.",
  unique_author_count: "Number of contributors with recent commits on this file.",
  top_author_pct: "Percentage of commits from the primary author (concentration risk).",
  bug_fix_ratio: "Share of commits classified as bug fixes versus feature work.",
  days_since_last_commit: "Elapsed days since the last commit touching this file.",
  downstream_count: "Count of modules that depend on this file (blast radius).",
  out_degree: "Number of direct import dependencies from this file.",
  betweenness: "Graph centrality — how often this file bridges dependency paths.",
  churn_90d: "Number of edits in the trailing 90-day window.",
  lines_of_code: "Non-blank lines of code in the module.",
  roi_days: "Estimated engineering days recovered if debt is reduced (directional).",
  cyclomatic_complexity: "Branching complexity — higher values increase test and review cost.",
  test_coverage_ratio:
    "Ratio of test file lines to source lines (heuristic; not instrumented coverage).",
};

export const SHAP_PLAIN = {
  "Test file ratio": "presence of test files relative to production code",
  "Test coverage ratio": "presence of test files relative to production code",
  "Cyclomatic complexity": "branching and decision-path complexity",
  "Cognitive complexity": "human readability and maintainability",
  "Churn rate (90d)": "frequency of recent edits",
  "Lines of code": "module size",
  "Function count": "number of functions in the module",
  "Max function complexity": "highest complexity among functions",
  "Dependency fan-out": "count of files imported by this module",
};

export const RISK_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const RISK_FILTERS = [
  { id: "all", label: "All" },
  { id: "high", label: "High risk" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];
