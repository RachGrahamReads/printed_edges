# Python Processing Service

This service handles PDF processing with edge image superimposition for the Printed Edges application.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Start the service:
```bash
python app.py
```

The service will run on `http://localhost:5001` by default.

## Environment Variables

- `PYTHON_SERVICE_URL`: Set this in your Next.js `.env.local` to point to the Python service (default: `http://localhost:5001`)

## API Endpoints

### POST /process
Processes a PDF with edge image superimposition.

**Request body:**
```json
{
  "pdf_path": "url_to_pdf",
  "edge_path": "url_to_edge_image", 
  "trim_width": 5,
  "trim_height": 8,
  "num_pages": 30,
  "page_type": "white",
  "position": "right",
  "mode": "single"
}
```

**Response:**
Returns the processed PDF file as a download.

### GET /health
Health check endpoint.

## Dependencies

- Flask: Web framework
- PyMuPDF (fitz): PDF processing
- Pillow (PIL): Image processing
- requests: HTTP client for downloading files
- flask-cors: CORS support for cross-origin requests