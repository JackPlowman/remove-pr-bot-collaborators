// Remove PR Bot Collaborators
// Removes bot "Co-authored-by:" lines from merge commit messages.

const DEFAULT_REGEX_SOURCES = [
  // Matches usernames/emails containing [bot], e.g., dependabot[bot]@...
  "\\[bot\\]",
  // Matches tokenized bot names like -bot, +bot, .bot or bot end
  "(?:^|[+\\-._])bot(?:$|[+\\-._])",
  // Matches GitHub Copilot co-author lines
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

function isSignedOffLine(line) {
  // Typical DCO footer. Be lenient with spaces/hyphens.
  return /\bSigned[-\s]*off[-\s]*by:\s+/i.test(line);
}

function parseSignedOff(line) {
  // Signed-off-by: Name <email>
  const m = /^\s*Signed[-\s]*off[-\s]*by:\s*(.+?)\s*<([^>]+)>\s*$/i.exec(line);
  if (!m) return null;
  const name = (m[1] || "").trim();
  const email = (m[2] || "").trim();
  return { name, email };
}

function getPRAuthorUsername() {
  try {
    // Heuristics to find PR author username in the header area
    const selectors = [
      ".gh-header-meta .author",
      ".gh-header-show .author",
      "#partial-discussion-header .author",
      "#discussion_bucket .gh-header-meta .author",
      "#discussion_bucket a.author",
      "a.author",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const txt = el?.textContent?.trim();
      if (txt && /[A-Za-z0-9-_.]/.test(txt)) {
        return txt.toLowerCase();
      }
    }
  } catch (e) {
    console.warn("[Remove PR Bot Collaborators] Failed to get PR author username:", e);
  }
  return null;
}

function extractUsernameCandidates(email, name) {
  const out = new Set();
  const lc = (s) => (s || "").toLowerCase();

  const [localRaw = "", domain = ""] = (email || "").split("@");
  const local = lc(localRaw);
  const dom = lc(domain);

  if (local) out.add(local);
  if (local.includes("+")) {
    const [left, right] = local.split("+", 2);
    if (left) out.add(left);
    if (right) out.add(right);
    // For GitHub noreply pattern: id+username@users.noreply.github.com
    if (dom.endsWith("users.noreply.github.com") && right) {
      out.add(right);
    }
  }

  // Derive a username-ish candidate from the name by stripping spaces and punctuation
  const nameCandidate = lc((name || "").replace(/[^a-z0-9-_]+/gi, ""));
  if (nameCandidate) out.add(nameCandidate);

  return out;
}

function cleanCommitMessageValue(value) {
  if (typeof value !== "string" || !value) {
    return { text: value, changed: false };
  }

  const lines = value.split(/\r?\n/);
  const filtered = [];
  let changed = false;
  const hadCoAuthorsBefore = lines.some((l) => isCoAuthorLine(l));
  let removedBotCoAuthor = false;

  for (const line of lines) {
    if (isCoAuthorLine(line) && isBotCoAuthor(line)) {
      changed = true;
      removedBotCoAuthor = true;
      continue; // drop bot co-author line
    }
    filtered.push(line);
  }

  const hasCoAuthorsLeft = filtered.some((l) => isCoAuthorLine(l));

  // If we removed any co-author (bot by us or otherwise none remain now), and the Signed-off-by is the PR creator, drop both
  if (removedBotCoAuthor || (hadCoAuthorsBefore && !hasCoAuthorsLeft)) {
    const prAuthor = getPRAuthorUsername();
    if (prAuthor) {
      const idx = filtered.findIndex((l) => isSignedOffLine(l));
      if (idx !== -1) {
        const info = parseSignedOff(filtered[idx]);
        if (info) {
          const candidates = extractUsernameCandidates(info.email, info.name);
          const nameLower = info.name.toLowerCase();
          const matchesAuthor =
            candidates.has(prAuthor) ||
            nameLower === prAuthor ||
            nameLower.includes(`@${prAuthor}`);
          if (matchesAuthor) {
            // Remove the signed-off line
            filtered.splice(idx, 1);
            changed = true;

            // If there's a '---' separator directly above (ignoring blank lines), remove it too
            let j = Math.min(idx - 1, filtered.length - 1);
            while (j >= 0 && filtered[j].trim() === "") j--;
            if (j >= 0 && /^-{3,}$/.test(filtered[j].trim())) {
              filtered.splice(j, 1);
              changed = true;
            } else {
              // Alternatively, remove any lone '---' if no remaining metadata
              if (!filtered.some((l) => isCoAuthorLine(l))) {
                const sepIdx = filtered.findIndex((l) => /^\s*-{3,}\s*$/.test(l));
                if (sepIdx !== -1) {
                  filtered.splice(sepIdx, 1);
                  changed = true;
                }
              }
            }
          }
        }
      }
    }
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
  if (typeof val !== "string") continue;

    const { text, changed } = cleanCommitMessageValue(val);
    if (changed && text !== val) {
      ta.value = text;

      // Fire events so GitHub UI updates previews/counters
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
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
    console.debug("[Remove PR Bot Collaborators] Error during scan:", e);
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
