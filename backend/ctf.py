"""CTF side quests for White Hat Bingo.

Players hunt for flags hidden behind deliberately planted, fake
vulnerabilities ("honeypot challenges"). Every flag is unique to the player
who finds it, so a flag passed to a friend is useless to them. Entering a
valid flag earns a credit, and a credit lets the player stamp any square on
their card as a free square that counts as called.

The host's "Exploits On/Off" button (game["exploits_enabled"]) controls all of
it: when off, every challenge page returns 404, the leaked debug field
disappears, and new flags can't be entered. Credits a player already earned
can still be spent.

Key functioning:
A flag is derived on demand
    flag_key = HMAC-SHA256(BINGO_SECRET, "white-hat-bingo/ctf-flags/v1")
    flag     = HMAC-SHA256(flag_key, game_id | challenge_id | player_id)[:20 hex]
    shown as   WHB{xxxxx-xxxxx-xxxxx-xxxxx}

player_id is the player's Firebase user ID. game_id changes on every reset, so
every flag changes
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time
from collections import defaultdict, deque

from flask import Response, abort, g, jsonify, request
from markupsafe import escape

# Config

MAX_FREE_SQUARES = int(os.environ.get("BINGO_CTF_MAX_FREE", "2"))
FAIL_LIMIT = 8            # wrong flags allowed per player...
FAIL_WINDOW = 60.0        # ...per this many seconds
MAX_FLAG_INPUT = 64       # longest flag text we'll even look at
MAX_FORM_INPUT = 200      # longest username/password the fake logins accept
MAX_EVENTS = 500          # CTF log entries kept in memory

VISITOR_COOKIE = "whb_ctf"  # random per-player token: who is visiting a challenge page
ROLE_COOKIE = "whb_role"    # the bait for the cookie challenge (meant to be edited)

FREE_INDEX = 12

CHALLENGES = [
    {
        "id": "network",
        "title": "Loose lips",
        "hint": "The app tells your browser more than it shows you. "
                "Open DevTools, go to the Network tab, and look at what your card loads.",
    },
    {
        "id": "robots",
        "title": "Please don't look here",
        "hint": "Websites leave a note telling search engines which pages to skip. "
                "Where is that note kept, and what does it say?",
    },
    {
        "id": "cookie",
        "title": "Promote yourself",
        "hint": "The page at /staff-panel decides who you are by reading a cookie.",
    },
    {
        "id": "printer",
        "title": "Out of the box",
        "hint": "Someone plugged a PrintMaster 3000 in at /printer and never changed its login.",
    },
    {
        "id": "sqli",
        "title": "Always true",
        "hint": "The host login at /admin checks your password by pasting it into a database query.",
    },
]
CHALLENGE_IDS = [c["id"] for c in CHALLENGES]
CHALLENGE_TITLES = {c["id"]: c["title"] for c in CHALLENGES}

_CSP = (
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
    "base-uri 'none'; frame-ancestors 'none'"
)


# Keys

def load_secret() -> bytes:
    secret = os.environ.get("BINGO_SECRET", "")
    if not secret:
        print("Warning: BINGO_SECRET is not set. CTF flags will change every time "
              "the server restarts. Add BINGO_SECRET to backend/.env for events.")
        secret = secrets.token_hex(32)
    return secret.encode()


def derive_flag_key(secret: bytes) -> bytes:
    """A key used only for flags (domain separation from anything else)."""
    return hmac.new(secret, b"white-hat-bingo/ctf-flags/v1", hashlib.sha256).digest()


def make_flag(flag_key: bytes, game_id: str, player_id: str, challenge_id: str) -> str:
    """The unique key for one player and one challenge in this game."""
    msg = f"{game_id}|{challenge_id}|{player_id}".encode()
    body = hmac.new(flag_key, msg, hashlib.sha256).hexdigest()[:20]
    return "WHB{" + "-".join(body[i:i + 5] for i in range(0, 20, 5)) + "}"


def normalize_flag(text: str) -> str:
    """Forgive copy-paste noise: case, spaces, dashes, and a missing WHB{...}."""
    text = text.strip()
    m = re.fullmatch(r"(?i)whb\{(.*)\}", text)
    if m:
        text = m.group(1)
    return re.sub(r"[\s\-]", "", text).lower()


class Ctf:
    def __init__(self, get_game, lock, current_user, player_or_404, require_admin, secret):
        self.get_game = get_game
        self.lock = lock
        self.current_user = current_user
        self.player_or_404 = player_or_404
        self.require_admin = require_admin
        self.flag_key = derive_flag_key(secret)
        self.failures = defaultdict(deque)   # player_id -> timestamps of wrong flags

    # Everything below expects the caller to hold the lock.

    def enabled(self) -> bool:
        return bool(self.get_game().get("exploits_enabled", True))

    def flag(self, player_id: str, challenge_id: str) -> str:
        return make_flag(self.flag_key, self.get_game()["id"], player_id, challenge_id)

    @staticmethod
    def ensure_fields(p: dict) -> None:
        p.setdefault("ctf_solved", {})       # challenge_id -> time solved
        p.setdefault("free_squares", set())  # card indexes stamped with a credit
        p.setdefault("ctf_token", secrets.token_urlsafe(16))

    @staticmethod
    def credits(p: dict) -> int:
        earned = min(len(p["ctf_solved"]), MAX_FREE_SQUARES)
        return max(0, earned - len(p["free_squares"]))

    def log(self, kind: str, name: str, challenge: str | None = None, detail: str = "") -> None:
        events = self.get_game().setdefault("ctf_events", [])
        events.append({
            "kind": kind,                     # opened | solved | shared | used
            "name": name,
            "challenge": challenge,
            "detail": detail,
            "at": time.time(),
        })
        del events[:-MAX_EVENTS]

    def player_view(self, player_id: str, p: dict) -> dict:
        """The `ctf` block added to GET /api/player."""
        self.ensure_fields(p)
        g.ctf_visitor_token = p["ctf_token"]   # picked up by the after_request hook
        view = {
            "enabled": self.enabled(),
            "challenges": [
                {"id": c["id"], "title": c["title"], "hint": c["hint"],
                 "solved": c["id"] in p["ctf_solved"]}
                for c in CHALLENGES
            ],
            "credits": self.credits(p),
            "free_squares": sorted(p["free_squares"]),
            "max_free": MAX_FREE_SQUARES,
        }
        if view["enabled"]:
            # Challenge "network": a leftover debug field nobody sees in the UI.
            view["debug_token"] = f"TODO remove before launch -> {self.flag(player_id, 'network')}"
        return view

    def login_exploit_flag(self, user: dict | None) -> str | None:
        """For admin_login's exploit branch: the player's "Always true" flag, if they're playing."""
        if not user:
            return None
        p = self.get_game()["players"].get(user["sub"])
        if not p:
            return None
        self.log("opened", p["name"], "sqli")
        return self.flag(user["sub"], "sqli")

    def log_exploit(self, p: dict | None, payload: str) -> None:
        """Same entry format as app.py's exploit_log (name, email, payload, ip, at)."""
        self.get_game().setdefault("exploit_log", []).append({
            "name": p["name"] if p else "Anonymous (Not Signed In)",
            "email": (p.get("email") or "unknown") if p else "\u2014",
            "payload": payload,
            "ip": request.remote_addr or "unknown",
            "at": time.time(),
        })
        if p:
            print(f"User {p['name']} is being mischievous")

    def visitor(self):
        """The player visiting a challenge page (from their cookie), or (None, None)."""
        token = request.cookies.get(VISITOR_COOKIE, "")
        if token:
            for pid, p in self.get_game()["players"].items():
                if hmac.compare_digest(p.get("ctf_token", ""), token):
                    return pid, p
        return None, None


def register(app, *, get_game, lock, current_user, player_or_404, require_admin,
             secret: bytes | None = None) -> Ctf:
    ctf = Ctf(get_game, lock, current_user, player_or_404, require_admin,
              secret if secret is not None else load_secret())
    challenge_endpoints = set()

    def challenge_route(rule, **opts):
        """Route decorator for honeypot pages: 404 while exploits are off."""
        def deco(fn):
            def wrapped(*a, **kw):
                with lock:
                    on = ctf.enabled()
                if not on:
                    abort(404)
                return fn(*a, **kw)
            wrapped.__name__ = f"ctf_{fn.__name__}"
            challenge_endpoints.add(wrapped.__name__)
            app.add_url_rule(rule, wrapped.__name__, wrapped, **opts)
            return fn
        return deco

    # identity cookies + headers

    @app.after_request
    def _ctf_after(resp):
        # Challenge pages are opened by typing a URL, so they can't send the
        # Firebase token. Instead, the card poll the app already makes every
        # 2 seconds gives the browser a random per-player cookie.
        token = g.get("ctf_visitor_token")
        if token and resp.status_code == 200:
            secure = request.is_secure
            if request.cookies.get(VISITOR_COOKIE) != token:
                resp.set_cookie(VISITOR_COOKIE, token, httponly=True, samesite="Lax",
                                secure=secure, path="/")
            if ROLE_COOKIE not in request.cookies:
                # Only set when missing, so a player's edit survives the polling.
                resp.set_cookie(ROLE_COOKIE, "player", httponly=False, samesite="Lax",
                                secure=secure, path="/")
        if request.endpoint in challenge_endpoints:
            resp.headers["Content-Security-Policy"] = _CSP
            resp.headers["Cache-Control"] = "no-store"
            resp.headers["X-Robots-Tag"] = "noindex"
            resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp

    # player API --> Flag redemption

    @app.post("/api/player/flag")
    def ctf_redeem():
        player_id = current_user()["sub"]
        data = request.get_json(silent=True) or {}
        submitted = normalize_flag(str(data.get("flag", ""))[:MAX_FLAG_INPUT])
        if not submitted:
            abort(400, description="Enter a flag first.")

        with lock:
            p = player_or_404(player_id)
            ctf.ensure_fields(p)
            if not ctf.enabled():
                abort(403, description="Side quests are paused by the host.")

            now = time.time()
            fails = ctf.failures[player_id]
            while fails and now - fails[0] > FAIL_WINDOW:
                fails.popleft()
            if len(fails) >= FAIL_LIMIT:
                abort(429, description="Too many wrong flags. Wait a minute and try again.")

            # Check if this is one of this specific player's flags
            for cid in CHALLENGE_IDS:
                if hmac.compare_digest(submitted, normalize_flag(ctf.flag(player_id, cid))):
                    if cid in p["ctf_solved"]:
                        abort(409, description=f"You already redeemed “{CHALLENGE_TITLES[cid]}”.")
                    capped = len(p["ctf_solved"]) >= MAX_FREE_SQUARES
                    p["ctf_solved"][cid] = now
                    ctf.log("solved", p["name"], cid)
                    message = (
                        f"Solved “{CHALLENGE_TITLES[cid]}”! "
                        + ("You've already earned the most free squares, but it still counts."
                           if capped else "Pick any square on your card to make it free.")
                    )
                    return jsonify(ok=True, challenge=cid, message=message,
                                   credits=ctf.credits(p))

            # Check if someone is using someone elses flag
            fails.append(now)
            for other_id, other in get_game()["players"].items():
                if other_id == player_id:
                    continue
                for cid in CHALLENGE_IDS:
                    if hmac.compare_digest(submitted, normalize_flag(ctf.flag(other_id, cid))):
                        ctf.log("shared", p["name"], cid, detail=f"flag belonged to {other['name']}")
                        abort(400, description="That flag belongs to another player. "
                                               "Flags are unique to whoever finds them.")
            abort(400, description="That isn't a valid flag.")

    # player API --> spending credits to get a free square

    @app.post("/api/player/free-square")
    def ctf_free_square():
        player_id = current_user()["sub"]
        data = request.get_json(silent=True) or {}
        index = data.get("index")
        if not isinstance(index, int) or isinstance(index, bool) \
                or not 0 <= index < 25 or index == FREE_INDEX:
            abort(400, description="Invalid square.")
        with lock:
            p = player_or_404(player_id)
            ctf.ensure_fields(p)
            if p.get("won"):
                abort(409, description="You already have BINGO.")
            if index in p["free_squares"]:
                abort(409, description="That square is already free.")
            if ctf.credits(p) <= 0:
                abort(403, description="Solve a side quest to earn a free square.")
            p["free_squares"].add(index)
            p["marks"].add(index)
            ctf.log("used", p["name"], detail=f"square {index} ({p['card'][index]})")
            return jsonify(
                marks=sorted(p["marks"]),
                free_squares=sorted(p["free_squares"]),
                credits=ctf.credits(p),
            )

    # admin API

    @app.get("/api/admin/ctf")
    def ctf_admin_state():
        require_admin()
        with lock:
            game = get_game()
            players = []
            counts = {cid: 0 for cid in CHALLENGE_IDS}
            for p in game["players"].values():
                solved = list(p.get("ctf_solved", {}))
                for cid in solved:
                    counts[cid] += 1
                if solved or p.get("free_squares"):
                    players.append({
                        "name": p["name"],
                        "solved": solved,
                        "free_squares": len(p.get("free_squares", ())),
                    })
            return jsonify(
                enabled=ctf.enabled(),
                max_free=MAX_FREE_SQUARES,
                challenges=[{"id": c["id"], "title": c["title"], "solves": counts[c["id"]]}
                            for c in CHALLENGES],
                players=sorted(players, key=lambda x: -len(x["solved"])),
                events=list(reversed(game.get("ctf_events", [])))[:100],
            )

    # honeypot pages
    # Each one is opened by typing the URL in the browser. The whb_ctf cookie
    # says which player is visiting, so each page shows that player's flag.

    def page(title: str, body: str, status: int = 200) -> Response:
        html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<style>
 body{{font:15px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#111;color:#e6e6e6;
      max-width:720px;margin:40px auto;padding:0 16px}}
 h1{{font-size:1.2rem;border-bottom:1px solid #444;padding-bottom:8px}}
 a{{color:#8ab4ff}} input,button{{font:inherit;padding:6px 8px;margin:4px 0;
      background:#000;color:#e6e6e6;border:1px solid #666}}
 .flag{{display:inline-block;padding:8px 12px;border:1px dashed #6f6;color:#6f6;
      user-select:all;word-break:break-all}}
 .warn{{color:#f99}} .muted{{color:#999}} pre{{white-space:pre-wrap;background:#000;
      border:1px solid #333;padding:10px}}
</style></head><body><h1>{escape(title)}</h1>{body}</body></html>"""
        return Response(html, status=status, mimetype="text/html")

    def need_player():
        return page("Join first",
                    "<p>Open your bingo card first, then come back to this page "
                    "in the same browser.</p>", 403)

    def flag_box(pid: str, cid: str) -> str:
        return (f"<p>Your flag (unique to you):</p><p class='flag'>{escape(ctf.flag(pid, cid))}</p>"
                "<p class='muted'>Paste it into the Side quests box on your bingo card.</p>")

    # Challenge "robots" (the group's "Secret Flag Path"): robots.txt tells
    # crawlers to stay away from /secret_path, which advertises it to anyone
    # who reads the file. Visits are logged to game["exploit_log"] like the
    # admin-login exploit, and to the CTF log.

    @challenge_route("/robots.txt")
    def robots():
        return Response("User-agent: *\nDisallow: /secret_path\n", mimetype="text/plain")

    @challenge_route("/secret_path")
    def secret_path():
        with lock:
            pid, p = ctf.visitor()
            ctf.log_exploit(p, "/secret_path")
            if not p:
                return page("You found the secret path!",
                            "<p>Open your bingo card first (signed in, in this browser), "
                            "then reload this page to get your flag.</p>", 403)
            ctf.log("opened", p["name"], "robots")
            body = ("<p>Lesson: robots.txt is public. Listing a page there to hide it "
                    "just advertises it.</p>" + flag_box(pid, "robots"))
        return page("You found the secret path!", body)

    # Challenge "cookie": the page trusts a cookie the player can edit.

    @challenge_route("/staff-panel")
    def staff_panel():
        with lock:
            pid, p = ctf.visitor()
            if not p:
                return need_player()
            role = request.cookies.get(ROLE_COOKIE, "player")[:40]
            if role.strip().lower() not in ("staff", "admin"):
                return page("Staff panel",
                            f"<p class='warn'>Access denied. You are signed in as role: "
                            f"<b>{escape(role)}</b>. Staff only.</p>", 403)
            ctf.log("opened", p["name"], "cookie")
            body = ("<p>Welcome, staff member.</p>"
                    "<p class='muted'>Lesson: never let the browser decide who is allowed in. "
                    "Anything stored on the client can be edited by the client.</p>"
                    + flag_box(pid, "cookie"))
        return page("Staff panel", body)

    # Challenge "printer": default credentials on a fake device.

    @challenge_route("/printer", methods=["GET", "POST"])
    def printer():
        form = ("<form method='post'><label>Username<br><input name='u' autocomplete='off'></label><br>"
                "<label>Password<br><input name='p' type='password'></label><br>"
                "<button>Log in</button></form>"
                "<p class='muted'>PrintMaster 3000 web console, firmware 1.0.2</p>")
        if request.method == "GET":
            return page("PrintMaster 3000", form)
        with lock:
            pid, p = ctf.visitor()
            if not p:
                return need_player()
            u = request.form.get("u", "")[:MAX_FORM_INPUT].strip().lower()
            pw = request.form.get("p", "")[:MAX_FORM_INPUT].strip().lower()
            if (u, pw) != ("admin", "admin"):
                return page("PrintMaster 3000", "<p class='warn'>Invalid login.</p>" + form, 401)
            ctf.log("opened", p["name"], "printer")
            body = ("<p>Logged in as admin. Toner: 12%.</p>"
                    "<p class='muted'>Lesson: change the default password on every device "
                    "before it goes on the network.</p>" + flag_box(pid, "printer"))
        return page("PrintMaster 3000", body)

    # Challenge "sqli" lives in app.py's admin_login (your existing exploit);
    # it calls ctf.login_exploit_flag() to hand out the player's flag.

    return ctf
