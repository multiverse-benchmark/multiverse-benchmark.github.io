import { EnvironmentDemo } from './EnvironmentDemo';

/**
 * The paper's Figure 1 as one worked example: its five steps (task, read,
 * consult the user, act, verify) beside the MultiVerse desktop. The steps
 * carry the figure's content: the task, the simulated services, the user
 * simulator, the failure and success cases, and the verifiers.
 */
export function HowItWorks() {
  // `environment` is the anchor older links to the desktop use.
  return <div id="environment" className="how-example">
    <EnvironmentDemo />
  </div>;
}
