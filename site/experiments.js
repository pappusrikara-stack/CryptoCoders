// Experiment registry. Autopilot adds one entry per experiment and removes it
// when the experiment ships (the winning variant's code is then made permanent).
// Each apply(variant) changes the page for that variant; 'control' = page as built.
export const experiments = {
  // EXP-001: does showing the checklist before the countdown get more people to start it?
  checklist_first: {
    apply(variant) {
      if (variant !== 'checklist_first') return;
      const blocks = document.getElementById('blocks');
      blocks.prepend(document.getElementById('checklist'));
    },
  },
};

// Events the page sends. Metric definitions in Flagsmith must match these names exactly.
export const EVENTS = {
  checked: 'checklist_item_checked', // first tick in a visit (primary metric)
  completed: 'checklist_completed',  // all items ticked
};
