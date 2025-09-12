from flask import Flask, jsonify
import os

app = Flask(__name__)

@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "Python service is running", "port": os.environ.get("PORT", "Not set")})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "pdf_processor"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"Health app starting on port {port}")
    app.run(debug=False, port=port, host="0.0.0.0")