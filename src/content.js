// Remove PR Bot Collaborators
// Removes bot "Co-authored-by:" lines from merge commit messages.

const DEFAULT_REGEX_SOURCES = [
  // Matches usernames/emails containing [bot], e.g., dependabot[bot]@...
  "\\[bot\\]",
  // Matches tokenized bot names like -bot, +bot, .bot or bot end
  "(?:^|[+\\-._])bot(?:$|[+\\-._])",
  // Matches GitHub Copilot co-author lines,
  "Copilot",
];

let botRegexes = compileRegexes(DEFAULT_REGEX_SOURCES);

// Load user-configured patterns from storage
loadPatterns();
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === "sync" && changes.botRegexSources) {
    const sources = changes.botRegexSources.newValue || DEFAULT_REGEX_SOURCES;
    botRegexes = compileRegexes(sources);
    scheduleScan();
  }
});

function compileRegexes(sources) {
  const out = [];
  for (const src of sources || []) {
    try {
      out.push(new RegExp(src, "i"));
    } catch (e) {
      // Ignore invalid regex; keep going.
      console.warn("[Remove PR Bot Collaborators] Invalid regex source skipped:", src, e);
    }
  }
  return out.length ? out : [new RegExp("\\[bot\\]", "i")];
}

async function loadPatterns() {
  try {
    const res = await chrome.storage.sync.get({
      botRegexSources: DEFAULT_REGEX_SOURCES,
    });
    botRegexes = compileRegexes(
      res?.botRegexSources || DEFAULT_REGEX_SOURCES,
    );
    scheduleScan();
  } catch (e) {
    // In case storage isn't available, continue with defaults.
    console.warn("[Remove PR Bot Collaborators] Failed to load patterns, using defaults:", e);
  }
}

function isCoAuthorLine(line) {
  return /^\s*Co-authored-by:\s+/i.test(line);
}

function parseCoAuthor(line) {
  // Co-authored-by: Name <email>
  const m = /^\s*Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/i.exec(line);
  if (!m) return null;
  const name = (m[1] || "").trim();
  const email = (m[2] || "").trim();
  const local = email.split("@")[0] || "";
  return { name, email, local };
}

function isBotCoAuthor(line) {
  const parsed = parseCoAuthor(line);
  if (!parsed) return false;
  const { name, email, local } = parsed;

  return botRegexes.some((re) => {
    try {
      return re.test(name) || re.test(email) || re.test(local) || re.test(line);
    } catch {
      return false;
    }
  });
}

function cleanCommitMessageValue(value) {
  if (!value || !value.includes("Co-authored-by:")) {
    return { text: value, changed: false };
  }

  const lines = value.split(/\r?\n/);
  const filtered = [];
  let changed = false;

  for (const line of lines) {
    if (isCoAuthorLine(line) && isBotCoAuthor(line)) {
      changed = true;
      continue; // drop bot co-author line
    }
    filtered.push(line);
  }

  // Remove trailing blank lines
  while (filtered.length && filtered[filtered.length - 1].trim() === "") {
    filtered.pop();
    changed = true;
  }

  return { text: filtered.join("\n"), changed };
}

function processTextareas() {
  const textareas = document.querySelectorAll("textarea");
  if (!textareas.length) return;

  for (const ta of textareas) {
    // Only touch textareas that look like commit messages:
    // Heuristic: contains "Co-authored-by:" which GitHub adds during merges.
    const val = ta.value;
    if (typeof val !== "string" || !val.includes("Co-authored-by:")) continue;

    const { text, changed } = cleanCommitMessageValue(val);
    if (changed && text !== val) {
      ta.value = text;

      // Fire events so GitHub UI updates previews/counters
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
      // console.debug("[GH Bot Cleaner] Cleaned bot co-authors from commit message.");
    }
  }
}

// Debounce utility
function debounce(fn, wait = 200) {
  let t = null;
  return function (...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

const scan = () => {
  try {
    processTextareas();
  } catch (e) {
    // Avoid throwing in content scripts
    // console.error("[Remove PR Bot Collaborators] Error:", e);
  }
};

const scheduleScan = debounce(scan, 150);

// Observe DOM changes because GitHub may re-render the merge box
const observer = new MutationObserver(() => scheduleScan());
observer.observe(document.documentElement || document.body, {
  childList: true,
  subtree: true,
});

// Also react to common interactions that change the message
document.addEventListener("input", scheduleScan, true);
document.addEventListener("focusin", scheduleScan, true);
document.addEventListener("click", scheduleScan, true);
window.addEventListener("load", scan);

// Initial run
scan();
