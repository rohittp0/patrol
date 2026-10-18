import "./survey-presentation.css";

// PostHog 1.438 renders popovers inside an open shadow root on this host.
// Keep that host intact so SDK question state, dismissal and response events
// retain their existing lifecycle. Only its presentation joins the top layer.
const HOST_SELECTOR = '[class*="PostHogSurvey-"]';
let surveyVisible = false;
export const surveyIsVisible = () => surveyVisible;

const BLOCKER_SELECTOR = '#tutorial, #case-briefing, .poster-dialog';
const SHADOW_LAYOUT = `
  :host { display:block; width:100%; }
  .ph-survey { position:relative!important; inset:auto!important; transform:none!important;
    width:100%!important; min-width:0!important; max-width:none!important; }
  .survey-form,.thank-you-message,.intro-screen { box-sizing:border-box; border-radius:10px;
    padding:60px 20px 20px; width:100%; overflow-wrap:anywhere; }
  .form-cancel { display:grid; place-items:center; width:44px; height:44px;
    min-width:44px; padding:12px; top:8px; right:8px; transform:none!important; }
  button,.multiple-choice-options label { min-height:44px; }
  .rating-options-number { grid-auto-flow:row; grid-template-columns:repeat(auto-fit,minmax(44px,1fr)); }
  .rating-options-emoji { flex-wrap:wrap; gap:4px; }
  .ratings-number,.ratings-emoji { min-width:44px; }
  input[type=text],textarea { font-size:16px!important; max-width:100%; box-sizing:border-box; }
  .limit-height { max-height:none; overflow:visible; }
  .ph-survey-widget-tab { display:none; }
`;

type HostedSurvey = {
  host: HTMLElement;
  shadow: ShadowRoot;
  observer: MutationObserver;
  parent: Node;
  next: Node | null;
  dialog: HTMLDialogElement | null;
  style: HTMLStyleElement | null;
};

/** Coordinate SDK popovers with Patrol's native result and newspaper dialogs.
 * Returns cleanup for isolated browser fixtures; no survey is requested or sent.
 */
export function installSurveyPresentation(documentRoot: Document = document): () => void {
  const view = documentRoot.defaultView!;
  const entries = new Map<HTMLElement, HostedSurvey>();
  const blockers = new Set<Element>();
  let queued = false, disposed = false;

  const schedule = () => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!disposed) synchronize(); });
  };
  const blockerObserver = new view.MutationObserver(schedule);
  const blocked = () => [...blockers].some((element) => element.isConnected &&
    (element instanceof view.HTMLDialogElement ? element.open : !(element as HTMLElement).hidden));

  function restore(entry: HostedSurvey) {
    if (!entry.dialog) return;
    if (entry.host.parentNode === entry.dialog) {
      // The SDK still finds its original host through document.querySelector.
      const parent = entry.parent.isConnected ? entry.parent : documentRoot.body;
      parent.insertBefore(entry.host, entry.next?.parentNode === parent ? entry.next : null);
    }
    entry.dialog.close();
    entry.dialog.remove();
    entry.style?.remove();
    entry.dialog = null;
    entry.style = null;
  }

  function synchronize() {
    documentRoot.querySelectorAll(BLOCKER_SELECTOR).forEach((element) => {
      if (blockers.has(element)) return;
      blockers.add(element);
      blockerObserver.observe(element, { attributes: true, attributeFilter: ["hidden", "open"] });
    });
    documentRoot.querySelectorAll<HTMLElement>(HOST_SELECTOR).forEach((host) => {
      if (!host.shadowRoot || entries.has(host)) return;
      const observer = new view.MutationObserver(schedule);
      observer.observe(host.shadowRoot, { childList: true, subtree: true });
      entries.set(host, { host, shadow: host.shadowRoot, observer, parent: host.parentNode!, next: host.nextSibling, dialog: null, style: null });
    });
    for (const [host, entry] of entries) {
      if (!host.isConnected) {
        entry.observer.disconnect();
        restore(entry);
        entries.delete(host);
        continue;
      }
      if (!entry.shadow.querySelector(".ph-survey")) { restore(entry); continue; }
      if (!entry.dialog) {
        const dialog = documentRoot.createElement("dialog");
        dialog.className = "survey-presentation";
        dialog.setAttribute("aria-label", "Patrol playtest feedback");
        dialog.addEventListener("cancel", (event) => {
          event.preventDefault();
          // Let PostHog capture a real dismissal and update its eligibility flags.
          entry.shadow.querySelector<HTMLButtonElement>(".form-cancel")?.click();
        });
        documentRoot.body.appendChild(dialog);
        entry.dialog = dialog;
        entry.style = documentRoot.createElement("style");
        entry.style.textContent = SHADOW_LAYOUT;
        entry.shadow.appendChild(entry.style);
        dialog.appendChild(host);
        entry.observer.observe(dialog, { childList: true });
      }
      if (blocked()) { entry.dialog.close(); continue; }
      if (!entry.dialog.open) {
        entry.dialog.showModal();
        // Native modal focus crosses the shadow root; prefer the question input
        // over the dismiss button so keyboard users begin with the feedback.
        entry.shadow.querySelector<HTMLElement>('textarea, input:not([type="hidden"]), .form-submit, button')?.focus({ preventScroll: true });
      }
    }
    surveyVisible = [...entries.values()].some(entry => entry.dialog?.open);
  }

  // Observe body children and known overlays only. Map actor/style mutations do
  // not trigger survey work, and no timer or frame-loop observer is installed.
  const bodyObserver = new view.MutationObserver(schedule);
  bodyObserver.observe(documentRoot.body, { childList: true });
  view.addEventListener("PHSurveyShown", schedule);
  synchronize();
  return () => {
    disposed = true;
    bodyObserver.disconnect();
    blockerObserver.disconnect();
    view.removeEventListener("PHSurveyShown", schedule);
    for (const entry of entries.values()) { entry.observer.disconnect(); restore(entry); }
    entries.clear();
    surveyVisible = false;
  };
}
