from flask import Flask, CORS, jsonify
from datetime import datetime

app = Flask(__name__)
CORS(app, origins=["*"])

@app.route("/api/data")
def home():
    return jsonify(
        msg="hello world",
        date=datetime.now().isoformat(timespec="seconds"),
    )

if __name__ == "__main__":
    app.run(debug=True, port=5001)