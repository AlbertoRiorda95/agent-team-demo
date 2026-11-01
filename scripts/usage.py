#!/usr/bin/env python3
"""Tokens and cost of the agents' runs, read from what each tool records.

Usage:
  python3 scripts/usage.py                        # this project's local sessions, every tool found
  python3 scripts/usage.py --since 2026-11-01     # only the sessions started since that day
  python3 scripts/usage.py claude-result FILE     # claude -p --output-format json, or the action's execution_file
  python3 scripts/usage.py claude-sessions [DIR]  # Claude Code transcripts (default ~/.claude/projects)
  python3 scripts/usage.py codex-sessions [DIR]   # Codex sessions (default $CODEX_HOME/sessions or ~/.codex/sessions)
  python3 scripts/usage.py opencode               # OpenCode sessions (opencode session list / export)

Options:
  --title TEXT    what the run was (an issue, a role), shown in the table
  --summary FILE  append the table in Markdown (default: $GITHUB_STEP_SUMMARY in GitHub Actions)
  --json FILE     append one JSON line per session, to add them up later

Only the sessions of this project (their folder is this repository) count. The
cost is the one the tool computes at list price (Claude Code, OpenCode); with a
subscription it is what the tokens would cost through the API. Codex reports
tokens only. A missing file or tool prints a note and exits 0: the agent's job
result never depends on this script.
"""
import argparse
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys

FIELDS = ("input", "cache_read", "cache_write", "output")


def root():
    p = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    return os.path.realpath(p.stdout.strip() if p.returncode == 0 else os.getcwd())


def record(tool, session, model, started, tokens, cost=None, calls=None, seconds=None):
    r = {"tool": tool, "session": session, "model": model, "started": started, "cost_usd": cost,
         "calls": calls, "seconds": seconds}
    r.update({k: int(tokens.get(k) or 0) for k in FIELDS})
    r["total"] = sum(r[k] for k in FIELDS)
    return r


def iso(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).isoformat(timespec="seconds") if ms else None


def lines(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                yield json.loads(line)
            except ValueError:
                continue


# ---- Claude Code

def claude_result(path):
    """A result object, a list of messages (the action's execution_file) or stream-json lines."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    try:
        data = json.loads(text)
        items = data if isinstance(data, list) else [data]
    except ValueError:
        items = [json.loads(x) for x in text.splitlines() if x.strip().startswith("{")]
    res = [x for x in items if isinstance(x, dict) and x.get("type") == "result"]
    if not res:
        return []
    r = res[-1]
    models = r.get("modelUsage") or {}
    u = r.get("usage") or {}
    tokens = {"input": u.get("input_tokens"), "output": u.get("output_tokens"),
              "cache_read": u.get("cache_read_input_tokens"), "cache_write": u.get("cache_creation_input_tokens")}
    if models:                                    # every model of the run, subagents included
        tokens = {"input": sum(m.get("inputTokens", 0) for m in models.values()),
                  "output": sum(m.get("outputTokens", 0) for m in models.values()),
                  "cache_read": sum(m.get("cacheReadInputTokens", 0) for m in models.values()),
                  "cache_write": sum(m.get("cacheCreationInputTokens", 0) for m in models.values())}
    row = record("claude", r.get("session_id"), ", ".join(models) or None, None, tokens,
                 r.get("total_cost_usd"), r.get("num_turns"), round((r.get("duration_ms") or 0) / 1000))
    row["denied"] = [denied(d) for d in r.get("permission_denials") or [] if isinstance(d, dict)]
    return [row]


def denied(d):
    """What a permission denial tried: the tool and its command or file, on one line."""
    i = d.get("tool_input") or {}
    what = i.get("command") or i.get("file_path") or i.get("pattern") or json.dumps(i)
    return f"{d.get('tool_name', '?')}: {' '.join(str(what).split())[:160]}"


def claude_sessions(directory, project):
    sessions = {}
    for path in glob.glob(os.path.join(directory, "**", "*.jsonl"), recursive=True):
        for o in lines(path):
            sid = o.get("sessionId")
            if not sid:
                continue
            s = sessions.setdefault(sid, {"cwd": None, "seen": set(), "tokens": dict.fromkeys(FIELDS, 0),
                                          "models": set(), "calls": 0, "state": None, "first": None})
            if o.get("cwd") and not s["cwd"]:
                s["cwd"] = os.path.realpath(o["cwd"])
            if o.get("timestamp") and not s["first"]:
                s["first"] = o["timestamp"][:19] + "+00:00"
            if o.get("type") == "cost-state":
                s["state"] = o                    # the session's running totals: the last one wins
            m = o.get("message") or {}
            if o.get("type") == "assistant" and m.get("usage") and m.get("id") not in s["seen"]:
                s["seen"].add(m.get("id"))        # a streamed message is written once per content block
                u = m["usage"]
                for k, src in (("input", "input_tokens"), ("output", "output_tokens"),
                               ("cache_read", "cache_read_input_tokens"), ("cache_write", "cache_creation_input_tokens")):
                    s["tokens"][k] += u.get(src) or 0
                s["models"].add(m.get("model"))
                s["calls"] += 1
    out = []
    for sid, s in sessions.items():
        if s["cwd"] != project or not s["calls"]:
            continue
        st, cost, secs = s["state"], None, None
        if st:
            mu = st.get("modelUsage") or {}
            s["tokens"] = {"input": sum(m.get("inputTokens", 0) for m in mu.values()),
                           "output": sum(m.get("outputTokens", 0) for m in mu.values()),
                           "cache_read": sum(m.get("cacheReadInputTokens", 0) for m in mu.values()),
                           "cache_write": sum(m.get("cacheCreationInputTokens", 0) for m in mu.values())}
            s["models"] = set(mu) or s["models"]
            cost, secs = st.get("totalCostUSD"), round((st.get("totalDuration") or 0) / 1000)
            s["first"] = iso(st.get("startTime")) or s["first"]
        out.append(record("claude", sid, ", ".join(sorted(x for x in s["models"] if x)), s["first"], s["tokens"],
                          cost, s["calls"], secs))
    return out


# ---- Codex

def codex_sessions(directory, project):
    out = []
    for path in sorted(glob.glob(os.path.join(directory, "**", "*.jsonl"), recursive=True)):
        meta, model, last, calls, first, end = {}, None, None, 0, None, None
        for o in lines(path):
            p = o.get("payload") or {}
            first, end = first or o.get("timestamp"), o.get("timestamp") or end
            if o.get("type") == "session_meta":
                meta = p
            elif o.get("type") == "turn_context":
                model = p.get("model") or model
            elif o.get("type") == "event_msg" and p.get("type") == "token_count" and p.get("info"):
                last = p["info"].get("total_token_usage") or last
                calls += 1
        if not meta or os.path.realpath(meta.get("cwd") or "") != project or not last:
            continue
        cached = last.get("cached_input_tokens") or 0
        tokens = {"input": (last.get("input_tokens") or 0) - cached, "cache_read": cached,
                  "cache_write": last.get("cache_write_input_tokens"), "output": last.get("output_tokens")}
        secs = None
        if first and end:
            t = [datetime.datetime.fromisoformat(x.replace("Z", "+00:00")) for x in (first, end)]
            secs = round((t[1] - t[0]).total_seconds())
        out.append(record("codex", meta.get("id"), model, (first or "")[:19] + "+00:00" if first else None,
                          tokens, None, calls, secs))
    return out


# ---- OpenCode

def opencode_bin():
    return shutil.which("opencode") or next((p for p in (os.path.expanduser("~/.opencode/bin/opencode"),)
                                             if os.access(p, os.X_OK)), None)


def opencode_sessions(project):
    exe = opencode_bin()
    if not exe:
        return None
    p = subprocess.run([exe, "session", "list", "--format", "json"], capture_output=True, text=True, timeout=120)
    try:
        listed = json.loads(p.stdout or "[]")
    except ValueError:
        return None
    out = []
    for s in listed:
        if os.path.realpath(s.get("directory") or "") != project:
            continue
        e = subprocess.run([exe, "export", s["id"]], capture_output=True, text=True, timeout=120)
        try:
            data = json.loads(e.stdout[e.stdout.find("{"):])
        except ValueError:
            continue
        tokens, cost, calls, models = dict.fromkeys(FIELDS, 0), 0.0, 0, set()
        for m in data.get("messages", []):
            info = m.get("info") or {}
            steps = [x for x in m.get("parts", []) if x.get("type") == "step-finish" and x.get("tokens")]
            for t, c in ([(x["tokens"], x.get("cost")) for x in steps] or
                         ([(info["tokens"], info.get("cost"))] if info.get("tokens") else [])):
                tokens["input"] += t.get("input") or 0
                tokens["output"] += (t.get("output") or 0) + (t.get("reasoning") or 0)
                tokens["cache_read"] += (t.get("cache") or {}).get("read") or 0
                tokens["cache_write"] += (t.get("cache") or {}).get("write") or 0
                cost += c or 0
                calls += 1
            if info.get("modelID"):
                models.add(f"{info.get('providerID')}/{info['modelID']}")
        if calls:
            out.append(record("opencode", s["id"], ", ".join(sorted(models)), iso(s.get("created")), tokens,
                              round(cost, 6), calls, round((s.get("updated", 0) - s.get("created", 0)) / 1000)))
    return out


# ---- output

def fmt(n):
    return f"{n:,}".replace(",", " ")


def table(rows, title):
    head = f"### Agent usage{': ' + title if title else ''}\n\n"
    if not rows:
        return head + "No session found.\n"
    cols = "| Tool | Session | Model | Input | Cache read | Cache write | Output | Total | Cost (list price) | Calls | Time |"
    out = [cols, "|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|"]
    for r in rows:
        cost = f"${r['cost_usd']:.4f}" if r["cost_usd"] is not None else "-"
        secs = f"{r['seconds'] // 60}m {r['seconds'] % 60:02d}s" if r["seconds"] is not None else "-"
        out.append(f"| {r['tool']} | {(r['session'] or '-')[:12]} | {r['model'] or '-'} | {fmt(r['input'])} | "
                   f"{fmt(r['cache_read'])} | {fmt(r['cache_write'])} | {fmt(r['output'])} | {fmt(r['total'])} | "
                   f"{cost} | {r['calls'] if r['calls'] is not None else '-'} | {secs} |")
    if len(rows) > 1:
        tot = {k: sum(r[k] for r in rows) for k in FIELDS + ("total",)}
        costs = [r["cost_usd"] for r in rows if r["cost_usd"] is not None]
        out.append(f"| **total** | | | {fmt(tot['input'])} | {fmt(tot['cache_read'])} | {fmt(tot['cache_write'])} | "
                   f"{fmt(tot['output'])} | {fmt(tot['total'])} | {'$%.4f' % sum(costs) if costs else '-'} | | |")
    refused = [x for r in rows for x in r.get("denied") or []]
    if refused:
        out += ["", f"Permission denied ({len(refused)}): the agent tried these and was refused, "
                    "each one costing a turn. Allow them in `--allowedTools` if they are right.", ""]
        out += [f"- `{x}`" for x in refused]
    return head + "\n".join(out) + "\n"


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", nargs="?", choices=["claude-result", "claude-sessions", "codex-sessions", "opencode"])
    ap.add_argument("path", nargs="?")
    ap.add_argument("--title", default="")
    ap.add_argument("--since")
    ap.add_argument("--summary", default=os.environ.get("GITHUB_STEP_SUMMARY"))
    ap.add_argument("--json")
    a = ap.parse_args(argv)
    project, home = root(), os.path.expanduser("~")
    codex_dir = os.path.join(os.environ.get("CODEX_HOME") or os.path.join(home, ".codex"), "sessions")
    rows, notes = [], []
    if a.source == "claude-result":
        if a.path and os.path.isfile(a.path):
            rows = claude_result(a.path)
        else:
            notes.append(f"no Claude Code result at {a.path!r}")
    else:
        if a.source in (None, "claude-sessions"):
            rows += claude_sessions(a.path or os.path.join(home, ".claude", "projects"), project)
        if a.source in (None, "codex-sessions"):
            rows += codex_sessions(a.path or codex_dir, project)
        if a.source in (None, "opencode"):
            found = opencode_sessions(project)
            if found is None and a.source == "opencode":
                notes.append("opencode is not installed")
            rows += found or []
    if a.since:
        rows = [r for r in rows if not r["started"] or r["started"][:10] >= a.since]
    rows.sort(key=lambda r: r["started"] or "")
    for n in notes:
        print(f"usage: {n}", file=sys.stderr)
    text = table(rows, a.title)
    print(text)
    if a.summary:
        with open(a.summary, "a", encoding="utf-8") as f:
            f.write(text + "\n")
    if a.json and rows:
        with open(a.json, "a", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(dict(r, title=a.title)) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
