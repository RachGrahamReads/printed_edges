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
        page_width = pdf_doc[0].rect.width
        page_height = pdf_doc[0].rect.height

        # Open edge image from URL
        edge_img = open_file_from_url(edge_url, is_image=True)
        edge_width, edge_height = edge_img.size

        # Get page thickness for slice width
        page_thickness_points = PAGE_THICKNESS.get(page_type.lower(), 0.0025 * POINTS_PER_INCH)
        slice_width_points = page_thickness_points * num_pages

        # Define bleed (extra margin to extend slice into)
        bleed_points = 10
        bleed_extra_points = 5
        bleed_total = bleed_points + bleed_extra_points

        previous_slice = None

        for page_num in range(len(pdf_doc)):
            page = pdf_doc[page_num]

            if page_num % 2 == 0:  # Odd page
                slice_width_px = max(1, int(edge_width * (slice_width_points / page_width)))
                x0 = (page_num // 2) * slice_width_px
                x1 = x0 + slice_width_px
                page_slice = edge_img.crop((x0, 0, x1, edge_height))
                page_slice = page_slice.resize((slice_width_px, int(page_height)), Image.Resampling.LANCZOS)
                previous_slice = page_slice
                current_position = "right"
            else:  # Even page
                if previous_slice is None:
                    raise ValueError("Even page without previous slice!")
                page_slice = ImageOps.mirror(previous_slice)
                current_position = "left"

            # Extend into bleed
            bleed_pixels = int(bleed_total)
            if current_position == "right":
                extension = page_slice.crop((page_slice.width - 1, 0, page_slice.width, int(page_height)))
            else:
                extension = page_slice.crop((0, 0, 1, int(page_height)))
            extension = extension.resize((bleed_pixels, int(page_height)), Image.Resampling.NEAREST)

            # Combine slice + extension
            if current_position == "right":
                final_slice = Image.new("RGBA", (page_slice.width + bleed_pixels, int(page_height)))
                final_slice.paste(page_slice, (0, 0))
                final_slice.paste(extension, (page_slice.width, 0))
                x_offset = page.rect.width - final_slice.width
            else:
                final_slice = Image.new("RGBA", (page_slice.width + bleed_pixels, int(page_height)))
                final_slice.paste(extension, (0, 0))
                final_slice.paste(page_slice, (bleed_pixels, 0))
                x_offset = 0

            # Convert to bytes
            img_bytes = BytesIO()
            final_slice.save(img_bytes, format="PNG")
            img_bytes.seek(0)

            # Insert into PDF
            page.insert_image(
                fitz.Rect(x_offset, 0, x_offset + final_slice.width, page.rect.height),
                stream=img_bytes.read(),
                keep_proportion=False
            )

        # Create temporary file for output
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
            output_path = tmp_file.name

        pdf_doc.save(output_path)
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

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy"})

if __name__ == "__main__":
    app.run(debug=True, port=5001, host="0.0.0.0")