import hashlib
import os
import secrets
import threading
import time

import cachecontrol
import requests
from flask import Flask, abort, jsonify, request, send_from_directory
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from werkzeug.exceptions import HTTPException

from questions import QUESTION_BANK

# Load backend .env file if present
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.isfile(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v

# Config

ADMIN_PASSWORD = os.environ.get("BINGO_ADMIN_PASSWORD", "changeme")
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "bingo-7280b")
EMAIL_DOMAIN = "@case.edu"
MAX_PLAYERS = int(os.environ.get("BINGO_MAX_PLAYERS", "300"))
MAX_NAME_LEN = 30
PORT = int(os.environ.get("PORT", "5001"))  # 5000 clashes with AirPlay on macOS

FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)

FREE_INDEX = 12  # centre square of a 5x5 card
LINES = (
    [[r * 5 + c for c in range(5)] for r in range(5)]           # rows
    + [[r * 5 + c for r in range(5)] for c in range(5)]         # columns
    + [[0, 6, 12, 18, 24], [4, 8, 12, 16, 20]]                  # diagonals
)

BANK_BY_TERM = {q["term"]: q for q in QUESTION_BANK}
assert len(BANK_BY_TERM) >= 24, "Question bank needs at least 24 unique terms"

app = Flask(__name__, static_folder=None)
lock = threading.Lock()

# google-auth fetches Google's signing keys on every verify; CacheControl reuses them until they expire.
_auth_request = google_requests.Request(session=cachecontrol.CacheControl(requests.Session()))


# Game state

def fresh_game():
    return {
        "id": secrets.token_hex(8),  # 64 random bits: unique per game, and the seed for every card in it
        "players": {},   # player_id -> {name, card, card_id, marks, joined_at, won}
        "called": [],    # [{n, term, question, at}]
        "claims": [],    # [{player, name, valid, line, at}]
        "winners": [],   # [name]
    }


game = fresh_game()
admin_tokens = set()


def called_terms():
    return {c["term"] for c in game["called"]}


def make_card(game_id, player_id):
    """Deal a card that can be rebuilt from (game id, player id) alone.

    Each term is ranked by sha256("<game_id>:<player_id>:<term>") and the 24 lowest
    fill the card in order. Order in QUESTION_BANK doesn't matter, but adding or
    removing terms changes every card.
    """
    def rank(term):
        return hashlib.sha256(f"{game_id}:{player_id}:{term}".encode()).digest()

    terms = sorted(BANK_BY_TERM, key=rank)[:24]
    terms.insert(FREE_INDEX, "FREE")
    return terms


def card_id(game_id, player_id):
    """Short code the host matches against a winner's screen; rebuildable like the card."""
    return hashlib.sha256(f"{game_id}:{player_id}".encode()).hexdigest()[:12]


def winning_line(player):
    """Return the first line that is marked and called"""
    called = called_terms()
    for line in LINES:
        if all(
            i in player["marks"]
            and (i == FREE_INDEX or player["card"][i] in called)
            for i in line
        ):
            return line
    return None


def current_user():
    """Verify the caller's Firebase ID token (Authorization: Bearer ...) and return its claims."""
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        abort(401, description="Please sign in.")
    try:
        claims = id_token.verify_firebase_token(token, _auth_request, audience=FIREBASE_PROJECT_ID)
    except Exception as e:
        print(f"Firebase token verification failed: {e}")
        abort(401, description="Your sign-in expired or is invalid - please sign in again.")
    # Google only: it proves the user owns the address. Password sign-ups could type any case.edu email.
    is_google = claims.get("firebase", {}).get("sign_in_provider") == "google.com"
    if not is_google or not claims.get("email", "").lower().endswith(EMAIL_DOMAIN):
        abort(403, description=f"Please sign in with your {EMAIL_DOMAIN} Google account.")
    return claims


def player_or_404(player_id):
    player = game["players"].get(player_id)
    if player is None:
        abort(404, description="Player not found (the game may have been reset).")
    return player


def require_admin():
    token = request.headers.get("X-Admin-Token", "")
    with lock:
        if token not in admin_tokens:
            abort(401, description="Admin login required.")


def public_called():
    """What players see: the questions only, never the answers."""
    return [{"n": c["n"], "question": c["question"], "at": c["at"]} for c in game["called"]]


@app.errorhandler(HTTPException)
def json_error(err):
    return jsonify(error=err.description), err.code


@app.errorhandler(500)
def server_error(err):
    # Unexpected crash inside Flask: the full traceback is printed in the Flask terminal.
    return jsonify(error="The game server hit an error - check the Flask terminal for details."), 500


# Player API

@app.get("/api/player")
def player_state():
    """The caller's card. Their first call in each game deals them in, named from their Google account."""
    user = current_user()
    player_id = user["sub"]
    with lock:
        p = game["players"].get(player_id)
        if p is None:
            if len(game["players"]) >= MAX_PLAYERS:
                abort(429, description="This game is full.")
            p = game["players"][player_id] = {
                "name": (user.get("name") or user["email"].split("@")[0])[:MAX_NAME_LEN],
                "card": make_card(game["id"], player_id),
                "card_id": card_id(game["id"], player_id),
                "marks": {FREE_INDEX},
                "joined_at": time.time(),
                "won": False,
            }
        return jsonify(
            name=p["name"],
            card=p["card"],
            card_id=p["card_id"],
            marks=sorted(p["marks"]),
            won=p["won"],
            called=public_called(),
            winners=game["winners"],
        )


@app.post("/api/player/mark")
def toggle_mark():
    player_id = current_user()["sub"]
    data = request.get_json(silent=True) or {}
    index = data.get("index")
    if not isinstance(index, int) or not 0 <= index < 25 or index == FREE_INDEX:
        abort(400, description="Invalid square.")
    with lock:
        p = player_or_404(player_id)
        # Marks are free-form on purpose --> Correctness checked when BINGO claimed.
        p["marks"].symmetric_difference_update({index})
        return jsonify(marks=sorted(p["marks"]))


@app.post("/api/player/bingo")
def claim_bingo():
    player_id = current_user()["sub"]
    with lock:
        p = player_or_404(player_id)
        if p["won"]:
            return jsonify(valid=True, message="You already have BINGO!")
        line = winning_line(p)
        game["claims"].append({
            "player": player_id,
            "name": p["name"],
            "valid": line is not None,
            "line": line,
            "at": time.time(),
        })
        if line:
            p["won"] = True
            game["winners"].append(p["name"])
            return jsonify(valid=True, line=line, message="BINGO! Show your card ID to the host.")
        return jsonify(
            valid=False,
            message="Not quite - one of your marked squares hasn't been called yet.",
        )


# Admin API

@app.post("/api/admin/login")
def admin_login():
    data = request.get_json(silent=True) or {}
    supplied = str(data.get("password", ""))
    if not secrets.compare_digest(supplied, ADMIN_PASSWORD):
        abort(401, description="Wrong password.")
    token = secrets.token_urlsafe(24)
    with lock:
        admin_tokens.add(token)
    return jsonify(token=token)


@app.get("/api/admin/state")
def admin_state():
    require_admin()
    with lock:
        called = called_terms()
        return jsonify(
            game_id=game["id"],
            bank=[{**q, "called": q["term"] in called} for q in QUESTION_BANK],
            called=game["called"],
            players=[
                {
                    "id": player_id,
                    "name": p["name"],
                    "card": p["card"],
                    "card_id": p["card_id"],
                    "marks": sorted(p["marks"]),
                    "line": winning_line(p),  # a complete marked+called line, claimed or not
                    "won": p["won"],
                }
                for player_id, p in sorted(game["players"].items(), key=lambda kv: kv[1]["joined_at"])
            ],
            claims=[{k: v for k, v in c.items() if k != "player"} for c in reversed(game["claims"])],
            winners=game["winners"],
        )


@app.post("/api/admin/call")
def admin_call():
    """Send a question to all players."""
    require_admin()
    data = request.get_json(silent=True) or {}
    term = data.get("term")
    if not isinstance(term, str) or term not in BANK_BY_TERM:
        abort(400, description="Unknown term.")
    with lock:
        if term in called_terms():
            abort(409, description="Question previously sent.")
        question = str(data.get("question") or BANK_BY_TERM[term]["question"]).strip()[:300]
        entry = {"n": len(game["called"]) + 1, "term": term, "question": question, "at": time.time()}
        game["called"].append(entry)
        return jsonify(entry), 201


@app.post("/api/admin/reset")
def admin_reset():
    require_admin()
    global game
    with lock:
        game = fresh_game()
    return jsonify(ok=True)


# Serve the React app (production)

@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def frontend(path):
    if path.startswith("api/"):
        abort(404, description="Unknown API route.")
    if not os.path.isdir(FRONTEND_DIST):
        return (
            "Frontend not built. In dev, open the Vite server (http://localhost:5173). "
            "For production, run `npm run build` in frontend/.",
            200,
        )
    full = os.path.join(FRONTEND_DIST, path)
    if path and os.path.isfile(full):
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")  # client-side routes


if __name__ == "__main__":
    if ADMIN_PASSWORD == "changeme":
        print("Warning: using default admin password 'changeme'. Set admin password.")
    # The debug console runs Python, so keep it off unless asked for.
    app.run(host="0.0.0.0", port=PORT, debug=os.environ.get("FLASK_DEBUG") == "1")
