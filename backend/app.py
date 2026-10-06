from flask import Flask, jsonify, request
from datetime import datetime
from bingocard import squares

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response

@app.route("/api/data")
def home():
    return jsonify(
        msg="hello world!",
        date=datetime.now().isoformat(timespec="seconds"),
    )

@app.route("/api/squares")
def get_squares():
    return jsonify(squares)


if __name__ == "__main__":
    app.run(debug=True, port=5001)