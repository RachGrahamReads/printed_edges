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
SAFETY_BUFFER_INCHES = 0.125  # Extra safety margin beyond bleed for cutting tolerance (match max variance)
POINTS_PER_INCH = 72
BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH
SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH

# Page thickness per type in inches
PAGE_THICKNESS = {
    "bw": 0.0032,        # Black and white (0.0030-0.0035" range)
    "standard": 0.0032,  # Standard color (0.0030-0.0035" range) 
    "premium": 0.0037    # Premium color (0.0035-0.0039" range)
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

def process_pdf_files(pdf_path, edge_path, trim_width, trim_height, num_pages=30, num_leaves=None, page_type="white", position="right", mode="single", bleed_type="add_bleed"):
    try:
        # Open PDF from file path
        pdf_doc = fitz.open(pdf_path)
        original_width = pdf_doc[0].rect.width
        original_height = pdf_doc[0].rect.height

        # Open edge image from file path
        edge_img = Image.open(edge_path).convert("RGBA")
        edge_width, edge_height = edge_img.size

        # Calculate bleed dimensions - only add if bleed_type is 'add_bleed'
        if bleed_type == "add_bleed":
            bleed_points = BLEED_INCHES * POINTS_PER_INCH  # 0.125\" = 9 points
            new_width = original_width + bleed_points  # Add bleed only to outside edge
            new_height = original_height + (2 * bleed_points)  # Add bleed to top and bottom
        else:  # existing_bleed - PDF already has bleed, don't add more
            bleed_points = 0  # No additional bleed
            new_width = original_width  # Keep original dimensions
            new_height = original_height

        # Calculate number of leaves if not provided
        if num_leaves is None:
            num_leaves = (num_pages + 1) // 2  # Round up for odd pages
            
        # Get page thickness for slice width
        page_thickness_inches = PAGE_THICKNESS.get(page_type.lower(), 0.0032)
        page_thickness_points = page_thickness_inches * POINTS_PER_INCH

        previous_slice = None

        # Create new PDF with expanded pages
        new_pdf = fitz.open()

        for page_num in range(len(pdf_doc)):
            original_page = pdf_doc[page_num]
            
            # Create new page with bleed dimensions
            new_page = new_pdf.new_page(width=new_width, height=new_height)
            
            # Position original content - adjust based on whether we're adding bleed
            original_rect = fitz.Rect(0, 0, original_width, original_height)
            
            if bleed_type == "add_bleed":
                # For right pages (odd page numbers): content stays at left, bleed added to right
                # For left pages (even page numbers): content moves right by bleed amount, bleed added to left
                if page_num % 2 == 0:  # Right page (odd page number in book)
                    content_rect = fitz.Rect(
                        0,  # x0: no left offset (spine side)
                        bleed_points,  # y0: top margin
                        original_width,  # x1: original width
                        bleed_points + original_height  # y1: top margin + original height
                    )
                else:  # Left page (even page number in book)
                    content_rect = fitz.Rect(
                        bleed_points,  # x0: offset from left bleed
                        bleed_points,  # y0: top margin  
                        bleed_points + original_width,  # x1: offset + original width
                        bleed_points + original_height  # y1: top margin + original height
                    )
            else:  # existing_bleed - use original positioning, PDF already has bleed
                content_rect = fitz.Rect(0, 0, original_width, original_height)
            
            # Copy the original page content to the correct position
            new_page.show_pdf_page(content_rect, pdf_doc, page_num)

            # Now add the edge image - slice into thin strips per page
            leaf_number = page_num // 2  # Each leaf has 2 pages (front/back)
            
            # Calculate the thin slice width in pixels (one slice per leaf thickness)
            # The total image width should represent the total thickness of all leaves
            total_thickness_inches = page_thickness_inches * num_leaves
            single_leaf_thickness_pixels = max(1, int(edge_width * (page_thickness_inches / total_thickness_inches)))
            
            # Get the slice for this specific leaf
            slice_x_start = leaf_number * single_leaf_thickness_pixels
            slice_x_end = slice_x_start + single_leaf_thickness_pixels
            
            # Crop the thin slice from the original image
            page_slice = edge_img.crop((slice_x_start, 0, slice_x_end, edge_height))
            
            # Resize the slice vertically to match the page height + full bleed
            page_slice = page_slice.resize((single_leaf_thickness_pixels, int(new_height)), Image.Resampling.LANCZOS)
            
            # Calculate edge strip width - always 0.25" for proper coverage
            # Both cases need full coverage since final product will have bleed either way
            edge_strip_width = BLEED_POINTS + SAFETY_BUFFER_POINTS  # Always 0.125" + 0.125" = 0.25"
            
            # Stretch the thin slice to create a wider edge that extends into bleed
            stretched_slice = page_slice.resize((int(edge_strip_width), int(new_height)), Image.Resampling.LANCZOS)
            
            if page_num % 2 == 0:  # Right page (odd page number in book)
                # Position on right edge - always 0.25" inward from the outer edge
                # Use constants to ensure consistent 0.25" coverage regardless of bleed type
                edge_x = new_width - (BLEED_POINTS + SAFETY_BUFFER_POINTS)  # Always 0.25" inward from outer edge
                edge_rect = fitz.Rect(edge_x, 0, new_width, new_height)
                previous_slice = stretched_slice
                
            else:  # Left page (even page number in book) 
                # Mirror the previous slice for the left edge
                if previous_slice is None:
                    raise ValueError("Even page without previous slice!")
                stretched_slice = ImageOps.mirror(previous_slice)
                
                # Position on left edge - always use full 0.25" coverage
                edge_rect = fitz.Rect(0, 0, BLEED_POINTS + SAFETY_BUFFER_POINTS, new_height)
            
            # Use the stretched slice for final placement
            page_slice = stretched_slice

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

def process_pdf(pdf_url, edge_url, trim_width, trim_height, num_pages=30, num_leaves=None, page_type="white", position="right", mode="single", bleed_type="add_bleed"):
    try:
        # Open PDF from URL
        pdf_doc = open_file_from_url(pdf_url, is_image=False)
        original_width = pdf_doc[0].rect.width
        original_height = pdf_doc[0].rect.height

        # Open edge image from URL
        edge_img = open_file_from_url(edge_url, is_image=True)
        edge_width, edge_height = edge_img.size

        # Calculate bleed dimensions - only add if bleed_type is 'add_bleed'
        if bleed_type == "add_bleed":
            bleed_points = BLEED_INCHES * POINTS_PER_INCH  # 0.125" = 9 points
            new_width = original_width + bleed_points  # Add bleed only to outside edge
            new_height = original_height + (2 * bleed_points)  # Add bleed to top and bottom
        else:  # existing_bleed - PDF already has bleed, don't add more
            bleed_points = 0  # No additional bleed
            new_width = original_width  # Keep original dimensions
            new_height = original_height

        # Calculate number of leaves if not provided
        if num_leaves is None:
            num_leaves = (num_pages + 1) // 2  # Round up for odd pages
            
        # Get page thickness for slice width
        page_thickness_inches = PAGE_THICKNESS.get(page_type.lower(), 0.0032)
        page_thickness_points = page_thickness_inches * POINTS_PER_INCH

        previous_slice = None

        # Create new PDF with expanded pages
        new_pdf = fitz.open()

        for page_num in range(len(pdf_doc)):
            original_page = pdf_doc[page_num]
            
            # Create new page with bleed dimensions
            new_page = new_pdf.new_page(width=new_width, height=new_height)
            
            # Position original content - adjust based on whether we're adding bleed
            original_rect = fitz.Rect(0, 0, original_width, original_height)
            
            if bleed_type == "add_bleed":
                # For right pages (odd page numbers): content stays at left, bleed added to right
                # For left pages (even page numbers): content moves right by bleed amount, bleed added to left
                if page_num % 2 == 0:  # Right page (odd page number in book)
                    content_rect = fitz.Rect(
                        0,  # x0: no left offset (spine side)
                        bleed_points,  # y0: top margin
                        original_width,  # x1: original width
                        bleed_points + original_height  # y1: top margin + original height
                    )
                else:  # Left page (even page number in book)
                    content_rect = fitz.Rect(
                        bleed_points,  # x0: offset from left bleed
                        bleed_points,  # y0: top margin  
                        bleed_points + original_width,  # x1: offset + original width
                        bleed_points + original_height  # y1: top margin + original height
                    )
            else:  # existing_bleed - use original positioning, PDF already has bleed
                content_rect = fitz.Rect(0, 0, original_width, original_height)
            
            # Copy the original page content to the correct position
            new_page.show_pdf_page(content_rect, pdf_doc, page_num)

            # Now add the edge image - slice into thin strips per page
            leaf_number = page_num // 2  # Each leaf has 2 pages (front/back)
            
            # Calculate the thin slice width in pixels (one slice per leaf thickness)
            # The total image width should represent the total thickness of all leaves
            total_thickness_inches = page_thickness_inches * num_leaves
            single_leaf_thickness_pixels = max(1, int(edge_width * (page_thickness_inches / total_thickness_inches)))
            
            # Get the slice for this specific leaf
            slice_x_start = leaf_number * single_leaf_thickness_pixels
            slice_x_end = slice_x_start + single_leaf_thickness_pixels
            
            # Crop the thin slice from the original image
            page_slice = edge_img.crop((slice_x_start, 0, slice_x_end, edge_height))
            
            # Resize the slice vertically to match the page height + full bleed
            page_slice = page_slice.resize((single_leaf_thickness_pixels, int(new_height)), Image.Resampling.LANCZOS)
            
            # Calculate edge strip width - always 0.25" for proper coverage
            # Both cases need full coverage since final product will have bleed either way
            edge_strip_width = BLEED_POINTS + SAFETY_BUFFER_POINTS  # Always 0.125" + 0.125" = 0.25"
            
            # Stretch the thin slice to create a wider edge that extends into bleed
            stretched_slice = page_slice.resize((int(edge_strip_width), int(new_height)), Image.Resampling.LANCZOS)
            
            if page_num % 2 == 0:  # Right page (odd page number in book)
                # Position on right edge - always 0.25" inward from the outer edge
                # Use constants to ensure consistent 0.25" coverage regardless of bleed type
                edge_x = new_width - (BLEED_POINTS + SAFETY_BUFFER_POINTS)  # Always 0.25" inward from outer edge
                edge_rect = fitz.Rect(edge_x, 0, new_width, new_height)
                previous_slice = stretched_slice
                
            else:  # Left page (even page number in book) 
                # Mirror the previous slice for the left edge
                if previous_slice is None:
                    raise ValueError("Even page without previous slice!")
                stretched_slice = ImageOps.mirror(previous_slice)
                
                # Position on left edge - always use full 0.25" coverage
                edge_rect = fitz.Rect(0, 0, BLEED_POINTS + SAFETY_BUFFER_POINTS, new_height)
            
            # Use the stretched slice for final placement
            page_slice = stretched_slice

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
        num_leaves = data.get("num_leaves")  # Can be None, will be calculated if needed
        page_type = data.get("page_type", "white")
        position = data.get("position", "right")
        mode = data.get("mode", "single")

        if not pdf_path or not edge_path:
            return jsonify({"status": "error", "message": "Both pdf_path and edge_path are required"}), 400

        result = process_pdf(pdf_path, edge_path, trim_width, trim_height, num_pages, num_leaves, page_type, position, mode)
        
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

@app.route("/process-files", methods=["POST"])
def process_files():
    try:
        if 'pdf' not in request.files or 'edge' not in request.files:
            return jsonify({"status": "error", "message": "Both PDF and edge files are required"}), 400
        
        pdf_file = request.files['pdf']
        edge_file = request.files['edge']
        
        if pdf_file.filename == '' or edge_file.filename == '':
            return jsonify({"status": "error", "message": "No files selected"}), 400
        
        # Get parameters from form data
        num_pages = int(request.form.get('num_pages', 30))
        page_type = request.form.get('page_type', 'standard')
        bleed_type = request.form.get('bleed_type', 'add_bleed')  # 'add_bleed' or 'existing_bleed'
        trim_width = float(request.form.get('trim_width', 6))
        trim_height = float(request.form.get('trim_height', 9))
        
        # Save files temporarily
        pdf_temp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
        edge_temp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
        
        pdf_file.save(pdf_temp.name)
        edge_file.save(edge_temp.name)
        
        # Process using file paths (modify process_pdf to work with file paths)
        result = process_pdf_files(pdf_temp.name, edge_temp.name, trim_width, trim_height, num_pages, None, page_type, "right", "single", bleed_type)
        
        # Cleanup temp files
        os.unlink(pdf_temp.name)
        os.unlink(edge_temp.name)
        
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
    import os
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=True, port=port, host="0.0.0.0")