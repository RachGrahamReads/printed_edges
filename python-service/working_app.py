from flask import Flask, request, jsonify, send_file
import os
import tempfile
import uuid
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js requests

@app.route("/process-files", methods=["POST"])
def process_files():
    try:
        if 'pdf' not in request.files or 'edge' not in request.files:
            return jsonify({"status": "error", "message": "Both PDF and edge files are required"}), 400
        
        pdf_file = request.files['pdf']
        edge_file = request.files['edge']
        
        if pdf_file.filename == '' or edge_file.filename == '':
            return jsonify({"status": "error", "message": "No files selected"}), 400
        
        # For now, just return a placeholder response indicating the service is working
        # We'll add back the PDF processing once the service is stable
        return jsonify({
            "status": "success",
            "message": "Python service is working! PDF processing will be added once deployment is stable.",
            "received_files": {
                "pdf": pdf_file.filename,
                "edge": edge_file.filename
            }
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "pdf_processor"})

@app.route("/", methods=["GET"])
def root():
    return jsonify({
        "status": "Python service is running", 
        "port": os.environ.get("PORT", "Not set"),
        "service": "minimal_pdf_service"
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"Minimal PDF service starting on port {port}")
    app.run(debug=False, port=port, host="0.0.0.0")