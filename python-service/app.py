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
        
        # Log file details for debugging
        print(f"Received PDF: {pdf_file.filename}, Size: {len(pdf_file.read())} bytes")
        pdf_file.seek(0)  # Reset file pointer after reading
        
        print(f"Received Edge: {edge_file.filename}, Size: {len(edge_file.read())} bytes")
        edge_file.seek(0)  # Reset file pointer after reading
        
        # For now, return a success message to test the connection
        # We'll add PDF processing once the basic connection is working
        return jsonify({
            "status": "success",
            "message": "Files received successfully! PDF processing is temporarily disabled for testing on Render free tier.",
            "received_files": {
                "pdf": pdf_file.filename,
                "edge": edge_file.filename,
                "pdf_size": f"{len(pdf_file.read())} bytes",
                "edge_size": f"{len(edge_file.read())} bytes"
            }
        })

    except Exception as e:
        print(f"Error in process_files: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "pdf_processor_free_tier"})

@app.route("/", methods=["GET"])
def root():
    return jsonify({
        "status": "Python service is running on Render free tier", 
        "port": os.environ.get("PORT", "Not set"),
        "service": "minimal_pdf_service"
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"Minimal PDF service starting on port {port}")
    app.run(debug=False, port=port, host="0.0.0.0")