from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import tempfile
import os

# Try to import the required libraries
try:
    import fitz  # PyMuPDF
    from PIL import Image, ImageOps
    LIBRARIES_AVAILABLE = True
except ImportError:
    LIBRARIES_AVAILABLE = False

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            if not LIBRARIES_AVAILABLE:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                error_response = json.dumps({
                    'error': 'Python libraries not available. Using TypeScript fallback.',
                    'fallback': True
                })
                self.wfile.write(error_response.encode())
                return

            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                raise ValueError("No data received")

            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            # Extract parameters
            pdf_base64 = data.get('pdfBase64')
            edge_images = data.get('edgeImages', {})
            num_pages = data.get('numPages', 30)
            page_type = data.get('pageType', 'standard')
            bleed_type = data.get('bleedType', 'add_bleed')
            edge_type = data.get('edgeType', 'side-only')

            if not pdf_base64:
                raise ValueError("PDF data is required")

            print(f"Processing PDF: {len(pdf_base64)} chars, {num_pages} pages, {edge_type}")

            # Use your existing Python logic
            result = process_pdf_simple(
                pdf_base64,
                edge_images,
                num_pages,
                page_type,
                bleed_type,
                edge_type
            )

            # Send PDF response
            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Disposition', 'attachment; filename="processed.pdf"')
            self.send_header('Content-Length', str(len(result)))
            self.end_headers()
            self.wfile.write(result)

        except Exception as e:
            print(f"Error: {str(e)}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = json.dumps({'error': str(e)})
            self.wfile.write(error_response.encode())

def process_pdf_simple(pdf_base64, edge_images, num_pages, page_type, bleed_type, edge_type):
    """Simplified version of your Python PDF processing"""

    # Constants (same as your working version)
    BLEED_INCHES = 0.125
    SAFETY_BUFFER_INCHES = 0.125
    POINTS_PER_INCH = 72
    BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH
    SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH

    PAGE_THICKNESS = {
        "bw": 0.0032,
        "standard": 0.0032,
        "premium": 0.0037
    }

    # Decode PDF
    pdf_bytes = base64.b64decode(pdf_base64)
    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    original_width = pdf_doc[0].rect.width
    original_height = pdf_doc[0].rect.height

    # Decode edge images
    edge_imgs = {}
    if edge_images.get('side') and edge_images['side'].get('base64'):
        img_bytes = base64.b64decode(edge_images['side']['base64'])
        edge_imgs['side'] = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

    # Calculate dimensions
    if bleed_type == "add_bleed":
        bleed_points = BLEED_POINTS
        new_width = original_width + bleed_points
        new_height = original_height + (2 * bleed_points)
    else:
        bleed_points = 0
        new_width = original_width
        new_height = original_height

    # Process pages (simplified version)
    num_leaves = (num_pages + 1) // 2
    page_thickness_inches = PAGE_THICKNESS.get(page_type.lower(), 0.0032)

    new_pdf = fitz.open()
    previous_slice = None

    for page_num in range(min(len(pdf_doc), 10)):  # Limit to 10 pages for now
        original_page = pdf_doc[page_num]
        new_page = new_pdf.new_page(width=new_width, height=new_height)

        # Position content
        if bleed_type == "add_bleed":
            if page_num % 2 == 0:  # Right page
                content_rect = fitz.Rect(0, bleed_points, original_width, bleed_points + original_height)
            else:  # Left page
                content_rect = fitz.Rect(bleed_points, bleed_points, bleed_points + original_width, bleed_points + original_height)
        else:
            content_rect = fitz.Rect(0, 0, original_width, original_height)

        # Copy original content
        new_page.show_pdf_page(content_rect, pdf_doc, page_num)

        # Add simple edge processing if we have edge image
        if edge_imgs.get('side'):
            edge_strip_width = BLEED_POINTS + SAFETY_BUFFER_POINTS

            if page_num % 2 == 0:  # Right page
                edge_x = new_width - edge_strip_width
                edge_rect = fitz.Rect(edge_x, 0, new_width, new_height)
            else:  # Left page
                edge_rect = fitz.Rect(0, 0, edge_strip_width, new_height)

            # Create a simple colored rectangle for the edge
            new_page.draw_rect(edge_rect, color=(0.8, 0.6, 0.4), fill=(0.8, 0.6, 0.4))

    # Return PDF bytes
    result = new_pdf.tobytes()
    new_pdf.close()
    pdf_doc.close()

    return result