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
