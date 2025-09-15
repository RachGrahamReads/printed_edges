from http.server import BaseHTTPRequestHandler
import json
import fitz  # PyMuPDF
from PIL import Image, ImageOps
import base64
import io
import tempfile
import uuid

# Constants
BLEED_INCHES = 0.125
SAFETY_BUFFER_INCHES = 0.125
POINTS_PER_INCH = 72
BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH
SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH

# Page thickness per type in inches
PAGE_THICKNESS = {
    "bw": 0.0032,
    "standard": 0.0032,
    "premium": 0.0037
}

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            # Read request body
            content_length = int(self.headers['Content-Length'])
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

            # Process PDF
            result = process_pdf(
                pdf_base64,
                edge_images,
                num_pages,
                page_type,
                bleed_type,
                edge_type
            )

            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Disposition', 'attachment; filename="processed.pdf"')
            self.end_headers()
            self.wfile.write(result)

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = json.dumps({'error': str(e)})
            self.wfile.write(error_response.encode())

def process_pdf(pdf_base64, edge_images, num_pages, page_type, bleed_type, edge_type):
    # Decode PDF from base64
    pdf_bytes = base64.b64decode(pdf_base64)
    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    original_width = pdf_doc[0].rect.width
    original_height = pdf_doc[0].rect.height

    # Decode edge images
    edge_imgs = {}
    if edge_images.get('side') and edge_images['side'].get('base64'):
        edge_img_bytes = base64.b64decode(edge_images['side']['base64'])
        edge_imgs['side'] = Image.open(io.BytesIO(edge_img_bytes)).convert("RGBA")

    if edge_images.get('top') and edge_images['top'].get('base64'):
        edge_img_bytes = base64.b64decode(edge_images['top']['base64'])
        edge_imgs['top'] = Image.open(io.BytesIO(edge_img_bytes)).convert("RGBA")

    if edge_images.get('bottom') and edge_images['bottom'].get('base64'):
        edge_img_bytes = base64.b64decode(edge_images['bottom']['base64'])
        edge_imgs['bottom'] = Image.open(io.BytesIO(edge_img_bytes)).convert("RGBA")

    # Calculate bleed dimensions
    if bleed_type == "add_bleed":
        bleed_points = BLEED_POINTS
        new_width = original_width + bleed_points
        new_height = original_height + (2 * bleed_points)
    else:
        bleed_points = 0
        new_width = original_width
        new_height = original_height

    # Calculate number of leaves
    num_leaves = (num_pages + 1) // 2
    page_thickness_inches = PAGE_THICKNESS.get(page_type.lower(), 0.0032)

    previous_slice = None

    # Create new PDF with expanded pages
    new_pdf = fitz.open()

    for page_num in range(len(pdf_doc)):
        original_page = pdf_doc[page_num]

        # Create new page with bleed dimensions
        new_page = new_pdf.new_page(width=new_width, height=new_height)

        # Position original content
        original_rect = fitz.Rect(0, 0, original_width, original_height)

        if bleed_type == "add_bleed":
            if page_num % 2 == 0:  # Right page
                content_rect = fitz.Rect(
                    0,
                    bleed_points,
                    original_width,
                    bleed_points + original_height
                )
            else:  # Left page
                content_rect = fitz.Rect(
                    bleed_points,
                    bleed_points,
                    bleed_points + original_width,
                    bleed_points + original_height
                )
        else:
            content_rect = fitz.Rect(0, 0, original_width, original_height)

        # Copy the original page content
        new_page.show_pdf_page(content_rect, pdf_doc, page_num)

        # Add edge processing if edge image is provided
        if edge_imgs.get('side'):
            edge_img = edge_imgs['side']
            edge_width, edge_height = edge_img.size

            # Calculate slice for this page
            leaf_number = page_num // 2
            total_thickness_inches = page_thickness_inches * num_leaves
            single_leaf_thickness_pixels = max(1, int(edge_width * (page_thickness_inches / total_thickness_inches)))

            slice_x_start = leaf_number * single_leaf_thickness_pixels
            slice_x_end = slice_x_start + single_leaf_thickness_pixels

            # Crop and resize the slice
            page_slice = edge_img.crop((slice_x_start, 0, slice_x_end, edge_height))
            page_slice = page_slice.resize((single_leaf_thickness_pixels, int(new_height)), Image.Resampling.LANCZOS)

            edge_strip_width = BLEED_POINTS + SAFETY_BUFFER_POINTS
            stretched_slice = page_slice.resize((int(edge_strip_width), int(new_height)), Image.Resampling.LANCZOS)

            if page_num % 2 == 0:  # Right page
                edge_x = new_width - edge_strip_width
                edge_rect = fitz.Rect(edge_x, 0, new_width, new_height)
                previous_slice = stretched_slice
            else:  # Left page
                if previous_slice is None:
                    continue
                stretched_slice = ImageOps.mirror(previous_slice)
                edge_rect = fitz.Rect(0, 0, edge_strip_width, new_height)

            # Convert edge image to bytes and insert
            img_bytes = io.BytesIO()
            stretched_slice.save(img_bytes, format="PNG")
            img_bytes.seek(0)

            new_page.insert_image(
                edge_rect,
                stream=img_bytes.read(),
                keep_proportion=False
            )

    # Save the new PDF
    output_bytes = new_pdf.tobytes()
    new_pdf.close()
    pdf_doc.close()

    return output_bytes