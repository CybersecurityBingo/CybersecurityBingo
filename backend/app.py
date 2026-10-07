"""Flask backend for the bingo game.

Current Design
  * All game state lives in memory so rrestarting the server resets the game.
  * TODO: add a database so the game can survive a server restart (?)

  * Clients poll every couple of seconds instead of using websockets.
  * Admin logs in with a single shared password from an env variable.

Run (dev):   python app.py                  -> http://localhost:5001
Run (prod):  gunicorn -w 1 --threads 8 -b 0.0.0.0:5001 app:app
             (keep -w 1: state is in memory, so it can't be split across workers)

py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
"""

import hashlib
import hmac
import os
import random
import secrets
import threading
import time
from datetime import datetime

from flask import Flask, abort, jsonify, request, send_from_directory

from questions import QUESTION_BANK

# Config

ADMIN_PASSWORD = os.environ.get("BINGO_ADMIN_PASSWORD", "changeme")
SERVER_SECRET = os.environ.get("BINGO_SECRET", secrets.token_hex(32)).encode()
MAX_PLAYERS = int(os.environ.get("BINGO_MAX_PLAYERS", "300"))
MAX_NAME_LEN = 30
PORT = int(os.environ.get("PORT", "5001"))  # 5000 clashes with AirPlay on macOS

# Sites allowed to call this API directly from a browser (CORS). Not needed when
# going through the Vite proxy or the built app, but kept for any frontend that
# calls http://localhost:5001 directly. Comma-separated; override with an env var.
CORS_ORIGINS = {
    o.strip()
    for o in os.environ.get(
        "BINGO_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if o.strip()
}

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


@app.after_request
def add_cors_headers(response):
    # From the team's starter app.py, narrowed from "*" to an allowlist.
    origin = request.headers.get("Origin")
    if origin in CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Admin-Token"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


# Game state

def fresh_game():
    return {
        "id": secrets.token_hex(4),
        "players": {},   # player_id -> {name, card, marks, checksum, joined_at, won}
        "called": [],    # [{n, term, question, at}]
        "claims": [],    # [{player, name, valid, line, at}]
        "winners": [],   # [name]
    }


game = fresh_game()
admin_tokens = set()


def called_terms():
    return {c["term"] for c in game["called"]}


def make_card():
    terms = random.sample(list(BANK_BY_TERM), 24)
    terms.insert(FREE_INDEX, "FREE")
    return terms


# TODO: Yet to be determined if this is good enough
def card_checksum(player_id, name, card):
    """HMAC-SHA256 over the card so a card can't be forged or edited later."""
    payload = "|".join([game["id"], player_id, name, *card]).encode()
    return hmac.new(SERVER_SECRET, payload, hashlib.sha256).hexdigest()


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


def player_or_404(player_id):
    player = game["players"].get(player_id)
    if player is None:
        abort(404, description="Player not found (the game may have been reset).")
    return player


def require_admin():
    token = request.headers.get("X-Admin-Token", "")
    if token not in admin_tokens:
        abort(401, description="Admin login required.")


def public_called():
    """What players see: the questions only, never the answers."""
    return [{"n": c["n"], "question": c["question"], "at": c["at"]} for c in game["called"]]


@app.errorhandler(400)
@app.errorhandler(401)
@app.errorhandler(404)
@app.errorhandler(409)
@app.errorhandler(429)
def json_error(err):
    return jsonify(error=err.description), err.code


@app.errorhandler(500)
def server_error(err):
    # Unexpected crash inside Flask: the full traceback is printed in the Flask terminal.
    return jsonify(error="The game server hit an error - check the Flask terminal for details."), 500


# Player API

@app.get("/api/health")
def health():
    return jsonify(ok=True)


@app.get("/api/data")
def data():
    """Connection test from the team's starter app.py."""
    return jsonify(
        msg="hello world!",
        date=datetime.now().isoformat(timespec="seconds"),
    )


@app.post("/api/join")
def join():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:MAX_NAME_LEN]
    if not name:
        abort(400, description="Please enter a name.")
    with lock:
        if len(game["players"]) >= MAX_PLAYERS:
            abort(429, description="This game is full.")
        player_id = secrets.token_urlsafe(16)
        card = make_card()
        game["players"][player_id] = {
            "name": name,
            "card": card,
            "marks": {FREE_INDEX},
            "checksum": card_checksum(player_id, name, card),
            "joined_at": time.time(),
            "won": False,
        }
    return jsonify(player_id=player_id), 201


@app.get("/api/player/<player_id>")
def player_state(player_id):
    with lock:
        p = player_or_404(player_id)
        return jsonify(
            name=p["name"],
            card=p["card"],
            marks=sorted(p["marks"]),
            checksum=p["checksum"],
            won=p["won"],
            called=public_called(),
            winners=game["winners"],
        )


@app.post("/api/player/<player_id>/mark")
def toggle_mark(player_id):
    data = request.get_json(silent=True) or {}
    index = data.get("index")
    if not isinstance(index, int) or not 0 <= index < 25 or index == FREE_INDEX:
        abort(400, description="Invalid square.")
    with lock:
        p = player_or_404(player_id)
        # Marks are free-form on purpose --> Correctness checked when BINGO claimed.
        p["marks"].symmetric_difference_update({index})
        return jsonify(marks=sorted(p["marks"]))


@app.post("/api/player/<player_id>/bingo")
def claim_bingo(player_id):
    with lock:
        p = player_or_404(player_id)
        if p["won"]:
            return jsonify(valid=True, message="You already have BINGO!")
        # Re-verify the card hasn't been tampered with since it was issued.
        intact = hmac.compare_digest(
            p["checksum"], card_checksum(player_id, p["name"], p["card"])
        )
        line = winning_line(p) if intact else None
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
            return jsonify(valid=True, line=line, message="BINGO! Show your checksum to the host.")
        return jsonify(
            valid=False,
            message="Not quite - one of your marked squares hasn't been called yet.",
        )


# Admin API

@app.post("/api/admin/login")
def admin_login():
    data = request.get_json(silent=True) or {}
    supplied = str(data.get("password", ""))
    if not hmac.compare_digest(supplied, ADMIN_PASSWORD):
        abort(401, description="Wrong password.")
    token = secrets.token_urlsafe(24)
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
                    "name": p["name"],
                    "marks": len(p["marks"]) - 1,
                    "won": p["won"],
                    "checksum": p["checksum"][:12],
                }
                for p in sorted(game["players"].values(), key=lambda x: x["joined_at"])
            ],
            claims=[{k: v for k, v in c.items() if k != "player"} for c in reversed(game["claims"])],
            winners=game["winners"],
        )


@app.post("/api/admin/call")
def admin_call():
    """Send a question to all players."""
    require_admin()
    data = request.get_json(silent=True) or {}
    with lock:
        remaining = [t for t in BANK_BY_TERM if t not in called_terms()]
        if not remaining:
            abort(409, description="Every question has already been sent.")
        term = random.choice(remaining) if data.get("random") else data.get("term")
        if term not in BANK_BY_TERM:
            abort(400, description="Unknown term.")
        if term not in remaining:
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
    app.run(host="0.0.0.0", port=PORT, debug=True)