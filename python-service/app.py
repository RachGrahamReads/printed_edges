from flask import Flask, request, jsonify, send_file
import fitz  # PyMuPDF
from PIL import Image
from PIL import ImageOps
import requests
from io import BytesIO
import os
import tempfile
import uuid
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js requests

# Constants
BLEED_INCHES = 0.125
POINTS_PER_INCH = 72
BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH

# Page thickness per type in points (example estimates)
PAGE_THICKNESS = {
    "white": 0.0025 * POINTS_PER_INCH,  # ~0.0025" per page
    "cream": 0.0027 * POINTS_PER_INCH,
    "color": 0.003,
    "bw": 0.0025
}

def download_file(url):
    """Download a file from a URL and return the content as bytes."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        raise ValueError(f"Could not download file from URL '{url}': {e}")

def open_file_from_url(url, is_image=False):
    """
    Downloads a file from URL and opens it.
    Returns a PIL Image (if is_image=True) or a fitz PDF document.
    """
    try:
        file_content = download_file(url)
        if is_image:
            return Image.open(BytesIO(file_content)).convert("RGBA")
        else:
            return fitz.open(stream=file_content, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Could not open file from URL '{url}': {e}")

def process_pdf(pdf_url, edge_url, trim_width, trim_height, num_pages=30, page_type="white", position="right", mode="single"):
    try:
        # Open PDF from URL
        pdf_doc = open_file_from_url(pdf_url, is_image=False)
        original_width = pdf_doc[0].rect.width
        original_height = pdf_doc[0].rect.height

        # Open edge image from URL
        edge_img = open_file_from_url(edge_url, is_image=True)
        edge_width, edge_height = edge_img.size

        # Calculate bleed dimensions
        bleed_points = BLEED_INCHES * POINTS_PER_INCH  # 0.125" = 9 points
        new_width = original_width + (2 * bleed_points)  # Add bleed to both sides
        new_height = original_height + (2 * bleed_points)  # Add bleed to top/bottom

        # Get page thickness for slice width
        page_thickness_points = PAGE_THICKNESS.get(page_type.lower(), 0.0025 * POINTS_PER_INCH)
        slice_width_points = page_thickness_points * num_pages

        previous_slice = None

        # Create new PDF with expanded pages
        new_pdf = fitz.open()

        for page_num in range(len(pdf_doc)):
            original_page = pdf_doc[page_num]
            
            # Create new page with bleed dimensions
            new_page = new_pdf.new_page(width=new_width, height=new_height)
            
            # Copy original content to center of new page (with bleed margins)
            original_rect = fitz.Rect(0, 0, original_width, original_height)
            centered_rect = fitz.Rect(
                bleed_points,  # x0: left margin
                bleed_points,  # y0: top margin
                bleed_points + original_width,  # x1: left margin + original width
                bleed_points + original_height  # y1: top margin + original height
            )
            
            # Copy the original page content to the centered position
            new_page.show_pdf_page(centered_rect, pdf_doc, page_num)

            # Now add the edge image
            if page_num % 2 == 0:  # Odd page (right edge)
                slice_width_px = max(1, int(edge_width * (slice_width_points / original_width)))
                x0 = (page_num // 2) * slice_width_px
                x1 = x0 + slice_width_px
                page_slice = edge_img.crop((x0, 0, x1, edge_height))
                page_slice = page_slice.resize((slice_width_px, int(new_height)), Image.Resampling.LANCZOS)
                previous_slice = page_slice
                
                # Position on right edge (extends into bleed)
                edge_x = new_width - slice_width_px
                edge_rect = fitz.Rect(edge_x, 0, new_width, new_height)
                
            else:  # Even page (left edge)
                if previous_slice is None:
                    raise ValueError("Even page without previous slice!")
                page_slice = ImageOps.mirror(previous_slice)
                
                # Position on left edge (starts from left bleed)
                edge_rect = fitz.Rect(0, 0, page_slice.width, new_height)

            # Convert edge image to bytes and insert
            img_bytes = BytesIO()
            page_slice.save(img_bytes, format="PNG")
            img_bytes.seek(0)
            
            new_page.insert_image(
                edge_rect,
                stream=img_bytes.read(),
                keep_proportion=False
            )

        # Save the new PDF
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
            output_path = tmp_file.name

        new_pdf.save(output_path)
        new_pdf.close()
        pdf_doc.close()

        return {"status": "success", "output_path": output_path}

    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.route("/process", methods=["POST"])
def process_route():
    try:
        data = request.get_json()

        pdf_path = data.get("pdf_path")
        edge_path = data.get("edge_path") 
        trim_width = data.get("trim_width", 5)
        trim_height = data.get("trim_height", 8)
        num_pages = data.get("num_pages", 30)
        page_type = data.get("page_type", "white")
        position = data.get("position", "right")
        mode = data.get("mode", "single")

        if not pdf_path or not edge_path:
            return jsonify({"status": "error", "message": "Both pdf_path and edge_path are required"}), 400

        result = process_pdf(pdf_path, edge_path, trim_width, trim_height, num_pages, page_type, position, mode)
        
        if result["status"] == "error":
            return jsonify(result), 500

        # Return the processed PDF as a downloadable file
        return send_file(
            result["output_path"],
            as_attachment=True,
            download_name=f"processed_{uuid.uuid4().hex[:8]}.pdf",
            mimetype="application/pdf"
        )

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/analyze-pdf", methods=["POST"])
def analyze_pdf():
    try:
        if 'pdf' not in request.files:
            return jsonify({"status": "error", "message": "No PDF file provided"}), 400
        
        pdf_file = request.files['pdf']
        if pdf_file.filename == '':
            return jsonify({"status": "error", "message": "No file selected"}), 400
        
        # Read the PDF file
        pdf_content = pdf_file.read()
        pdf_doc = fitz.open(stream=pdf_content, filetype="pdf")
        
        # Get page count
        page_count = len(pdf_doc)
        
        # Get dimensions from first page (assuming all pages are the same size)
        first_page = pdf_doc[0]
        page_rect = first_page.rect
        
        # Convert from points to inches (72 points = 1 inch)
        width_inches = page_rect.width / POINTS_PER_INCH
        height_inches = page_rect.height / POINTS_PER_INCH
        
        pdf_doc.close()
        
        return jsonify({
            "status": "success",
            "pageCount": page_count,
            "dimensions": {
                "widthInches": round(width_inches, 3),
                "heightInches": round(height_inches, 3),
                "widthPoints": page_rect.width,
                "heightPoints": page_rect.height
            }
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy"})

if __name__ == "__main__":
    app.run(debug=True, port=5001, host="0.0.0.0")