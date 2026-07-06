import useInView from "./useInView";

const STEPS = [
  {
    num: "01",
    label: "Connect",
    title: ["LINK YOUR", " REPOSITORY"],
    desc: "Sign in with GitHub and point TelemetryX at any public or private repo you have access to.",
    align: "left",
  },
  {
    num: "02",
    label: "Analyze",
    title: ["ML ", "SCAN"],
    desc: "Models evaluate debt scores, churn, coupling, and contributor concentration in minutes.",
    align: "right",
  },
  {
    num: "03",
    label: "Prioritize",
    title: ["RANKED ", "FIXES"],
    desc: "Get a remediation plan sorted by impact and effort — with SHAP explanations in plain English.",
    align: "left",
  },
  {
    num: "04",
    label: "Act",
    title: ["EXPORT & ", "TRACK"],
    desc: "Push Jira-ready tickets and monitor trends over scan history for the same repo.",
    align: "right",
  },
];

export default function LandingWorkflow() {
  const [headerRef, headerVisible] = useInView({ threshold: 0.2 });

  return (
    <section id="workflow" className="landing-section landing-workflow">
      <div
        ref={headerRef}
        className={`landing-workflow__header landing-reveal landing-reveal--left${headerVisible ? " landing-reveal--visible" : ""}`}
      >
        <span className="landing-section__eyebrow">03 / Workflow</span>
        <h2 className="landing-section__title">HOW IT WORKS</h2>
      </div>

      <div className="landing-workflow__list">
        {STEPS.map((step) => (
          <WorkflowStep key={step.num} step={step} />
        ))}
      </div>
    </section>
  );
}

function WorkflowStep({ step }) {
  const [ref, visible] = useInView({ threshold: 0.2 });
  const revealClass =
    step.align === "right" ? "landing-reveal--right" : "landing-reveal--left";

  return (
    <article
      ref={ref}
      className={`landing-workflow__step${step.align === "right" ? " landing-workflow__step--right" : ""} landing-reveal ${revealClass}${visible ? " landing-reveal--visible" : ""}`}
    >
      <span className="landing-workflow__step-label">
        {step.num} / {step.label}
      </span>
      <h3 className="landing-workflow__step-title">
        <em>{step.title[0]}</em>
        {step.title[1]}
      </h3>
      <p className="landing-workflow__step-desc">{step.desc}</p>
      <div className="landing-workflow__step-line" />
    </article>
  );
}
