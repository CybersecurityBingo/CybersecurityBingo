# Backend
## Quick Start

```bash
uv sync
uv run python app.py
```

Runs on `http://localhost:5001`.

## Production

```bash
uv run gunicorn -w 1 --threads 8 -b 0.0.0.0:5001 app:app
```

Keep `-w 1`: all game state lives in memory, so more workers means separate games.

## Rebuilding a card

A card depends only on the game ID (shown in the host console) and the player's Firebase user ID:

```bash
uv run python -c "from app import make_card, card_id; print(card_id('GAME_ID', 'USER_ID'), make_card('GAME_ID', 'USER_ID'))"
```

Changing the terms in `questions.py` changes every card, so rebuild with the same question bank.
