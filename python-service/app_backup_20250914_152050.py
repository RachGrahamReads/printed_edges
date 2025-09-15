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

def process_pdf_files_multi_edge(pdf_path, edge_files_dict, trim_width, trim_height, num_pages=30, page_type="standard", bleed_type="add_bleed", edge_type="side-only"):
    try:
        print(f"Processing PDF with edge_type: {edge_type}, files: {list(edge_files_dict.keys())}")
        
        # Open PDF from file path
        pdf_doc = fitz.open(pdf_path)
        original_width = pdf_doc[0].rect.width
        original_height = pdf_doc[0].rect.height

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
        num_leaves = (num_pages + 1) // 2  # Round up for odd pages
        
        # Get page thickness for slice width
        page_thickness_inches = PAGE_THICKNESS.get(page_type.lower(), 0.0032)

        # Load edge images based on edge type
        edge_images = {}
        if edge_type == "side-only":
            print("Loading side-only edge image")
            edge_images['side'] = Image.open(edge_files_dict['side']).convert("RGBA")
        else:  # all-edges
            print("Loading all-edges images")
            # Only load images that are provided
            if 'topEdge' in edge_files_dict:
                edge_images['top'] = Image.open(edge_files_dict['topEdge']).convert("RGBA")
            if 'edge' in edge_files_dict:
                edge_images['side'] = Image.open(edge_files_dict['edge']).convert("RGBA") 
            if 'bottomEdge' in edge_files_dict:
                edge_images['bottom'] = Image.open(edge_files_dict['bottomEdge']).convert("RGBA")
            
            loaded_edges = [key for key in ['top', 'side', 'bottom'] if key in edge_images]
            sizes = [f"{key}: {edge_images[key].size}" for key in loaded_edges]
            print(f"Loaded images - {', '.join(sizes)}")

        previous_slice = None

        # Create new PDF with expanded pages
        new_pdf = fitz.open()

        for page_num in range(len(pdf_doc)):
            original_page = pdf_doc[page_num]
            
            # Create new page with bleed dimensions
            new_page = new_pdf.new_page(width=new_width, height=new_height)
            
            # Position original content - adjust based on whether we're adding bleed
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

            # Add edge images based on edge type
            if edge_type == "side-only":
                # Use existing side edge logic
                edge_img = edge_images['side']
                edge_width, edge_height = edge_img.size
                
                # Slice logic for side edge
                leaf_number = page_num // 2  # Each leaf has 2 pages (front/back)
                total_thickness_inches = page_thickness_inches * num_leaves
                single_leaf_thickness_pixels = max(1, int(edge_width * (page_thickness_inches / total_thickness_inches)))
                
                slice_x_start = leaf_number * single_leaf_thickness_pixels
                slice_x_end = slice_x_start + single_leaf_thickness_pixels
                
                page_slice = edge_img.crop((slice_x_start, 0, slice_x_end, edge_height))
                page_slice = page_slice.resize((single_leaf_thickness_pixels, int(new_height)), Image.Resampling.LANCZOS)
                
                edge_strip_width = BLEED_POINTS + SAFETY_BUFFER_POINTS
                stretched_slice = page_slice.resize((int(edge_strip_width), int(new_height)), Image.Resampling.LANCZOS)
                
                if page_num % 2 == 0:  # Right page
                    edge_x = new_width - (BLEED_POINTS + SAFETY_BUFFER_POINTS)
                    edge_rect = fitz.Rect(edge_x, 0, new_width, new_height)
                    previous_slice = stretched_slice
                else:  # Left page
                    if previous_slice is None:
                        raise ValueError("Even page without previous slice!")
                    stretched_slice = ImageOps.mirror(previous_slice)
                    edge_rect = fitz.Rect(0, 0, BLEED_POINTS + SAFETY_BUFFER_POINTS, new_height)
                
                # Insert side edge
                img_bytes = BytesIO()
                stretched_slice.save(img_bytes, format="PNG")
                img_bytes.seek(0)
                new_page.insert_image(edge_rect, stream=img_bytes.read(), keep_proportion=False)
                
            else:  # all-edges mode
                # Calculate common slicing parameters
                leaf_number = page_num // 2
                total_thickness_inches = page_thickness_inches * num_leaves
                
                # Add top edge with mirroring logic (only if top edge image is provided)
                if 'top' in edge_images:
                    top_img = edge_images['top']
                    top_width, top_height = top_img.size
                    print(f"Processing top edge for page {page_num + 1}: image size {top_width}x{top_height}")
                    
                    edge_strip_height = BLEED_POINTS + SAFETY_BUFFER_POINTS
                    
                    if page_num % 2 == 0:  # Right page (odd page number in book) - create new slice
                        # For top/bottom edges, slice based on thickness (width direction like side edges)
                        single_leaf_thickness_pixels_top = max(1, int(top_height * (page_thickness_inches / total_thickness_inches)))
                        
                        top_slice_y_start = leaf_number * single_leaf_thickness_pixels_top
                        top_slice_y_end = top_slice_y_start + single_leaf_thickness_pixels_top
                        
                        print(f"Top edge slice: y={top_slice_y_start}-{top_slice_y_end}, thickness_pixels={single_leaf_thickness_pixels_top}")
                        
                        top_slice = top_img.crop((0, top_slice_y_start, top_width, top_slice_y_end))
                        top_slice = top_slice.resize((int(new_width), single_leaf_thickness_pixels_top), Image.Resampling.LANCZOS)
                        top_stretched = top_slice.resize((int(new_width), int(edge_strip_height)), Image.Resampling.LANCZOS)
                        
                        # Store the slice for mirroring on the back page
                        if 'previous_top_slice' not in locals():
                            globals()['previous_top_slice'] = top_stretched
                        else:
                            globals()['previous_top_slice'] = top_stretched
                    else:  # Left page (even page number in book) - use mirrored slice
                        if 'previous_top_slice' not in globals():
                            raise ValueError("Left page without previous top slice!")
                        top_stretched = ImageOps.mirror(globals()['previous_top_slice'])
                    
                    # Position top edge
                    top_rect = fitz.Rect(0, 0, new_width, edge_strip_height)
                    print(f"Top edge rect: {top_rect}, strip height: {edge_strip_height}")
                    
                    top_bytes = BytesIO()
                    top_stretched.save(top_bytes, format="PNG")
                    top_bytes.seek(0)
                    new_page.insert_image(top_rect, stream=top_bytes.read(), keep_proportion=False)
                
                # Add bottom edge with mirroring logic (only if bottom edge image is provided)
                if 'bottom' in edge_images:
                    bottom_img = edge_images['bottom']
                    bottom_width, bottom_height = bottom_img.size
                    print(f"Processing bottom edge for page {page_num + 1}: image size {bottom_width}x{bottom_height}")
                    
                    edge_strip_height = BLEED_POINTS + SAFETY_BUFFER_POINTS
                    
                    if page_num % 2 == 0:  # Right page (odd page number in book) - create new slice
                        # Use same slicing logic for bottom edge
                        single_leaf_thickness_pixels_bottom = max(1, int(bottom_height * (page_thickness_inches / total_thickness_inches)))
                        
                        bottom_slice_y_start = leaf_number * single_leaf_thickness_pixels_bottom
                        bottom_slice_y_end = bottom_slice_y_start + single_leaf_thickness_pixels_bottom
                        
                        print(f"Bottom edge slice: y={bottom_slice_y_start}-{bottom_slice_y_end}, thickness_pixels={single_leaf_thickness_pixels_bottom}")
                        
                        bottom_slice = bottom_img.crop((0, bottom_slice_y_start, bottom_width, bottom_slice_y_end))
                        bottom_slice = bottom_slice.resize((int(new_width), single_leaf_thickness_pixels_bottom), Image.Resampling.LANCZOS)
                        bottom_stretched = bottom_slice.resize((int(new_width), int(edge_strip_height)), Image.Resampling.LANCZOS)
                        
                        # Store the slice for mirroring on the back page
                        if 'previous_bottom_slice' not in locals():
                            globals()['previous_bottom_slice'] = bottom_stretched
                        else:
                            globals()['previous_bottom_slice'] = bottom_stretched
                    else:  # Left page (even page number in book) - use mirrored slice
                        if 'previous_bottom_slice' not in globals():
                            raise ValueError("Left page without previous bottom slice!")
                        bottom_stretched = ImageOps.mirror(globals()['previous_bottom_slice'])
                    
                    # Position bottom edge
                    bottom_y = new_height - edge_strip_height
                    bottom_rect = fitz.Rect(0, bottom_y, new_width, new_height)
                    print(f"Bottom edge rect: {bottom_rect}, strip height: {edge_strip_height}")
                    
                    bottom_bytes = BytesIO()
                    bottom_stretched.save(bottom_bytes, format="PNG")
                    bottom_bytes.seek(0)
                    new_page.insert_image(bottom_rect, stream=bottom_bytes.read(), keep_proportion=False)
                
                # Add side edge (only if side edge image is provided)
                if 'side' in edge_images:
                    side_img = edge_images['side']
                    side_width, side_height = side_img.size
                    
                    side_slice_x_start = leaf_number * max(1, int(side_width * (page_thickness_inches / total_thickness_inches)))
                    side_slice_x_end = side_slice_x_start + max(1, int(side_width * (page_thickness_inches / total_thickness_inches)))
                    
                    side_slice = side_img.crop((side_slice_x_start, 0, side_slice_x_end, side_height))
                    side_slice = side_slice.resize((max(1, int(side_width * (page_thickness_inches / total_thickness_inches))), int(new_height)), Image.Resampling.LANCZOS)
                    
                    side_strip_width = BLEED_POINTS + SAFETY_BUFFER_POINTS
                    side_stretched = side_slice.resize((int(side_strip_width), int(new_height)), Image.Resampling.LANCZOS)
                    
                    if page_num % 2 == 0:  # Right page
                        side_x = new_width - side_strip_width
                        side_rect = fitz.Rect(side_x, 0, new_width, new_height)
                        previous_slice = side_stretched
                    else:  # Left page
                        if previous_slice is None:
                            raise ValueError("Even page without previous slice!")
                        side_stretched = ImageOps.mirror(previous_slice)
                        side_rect = fitz.Rect(0, 0, side_strip_width, new_height)
                    
                    side_bytes = BytesIO()
                    side_stretched.save(side_bytes, format="PNG")
                    side_bytes.seek(0)
                    new_page.insert_image(side_rect, stream=side_bytes.read(), keep_proportion=False)

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
        print("=== /process-files endpoint called ===", flush=True)
        print(f"Form data keys: {list(request.form.keys())}", flush=True)
        print(f"File keys: {list(request.files.keys())}", flush=True)
        
        if 'pdf' not in request.files:
            return jsonify({"status": "error", "message": "PDF file is required"}), 400
        
        pdf_file = request.files['pdf']
        
        if pdf_file.filename == '':
            return jsonify({"status": "error", "message": "No PDF file selected"}), 400
        
        # Get parameters from form data
        num_pages = int(request.form.get('num_pages', 30))
        page_type = request.form.get('page_type', 'standard')
        bleed_type = request.form.get('bleed_type', 'add_bleed')  # 'add_bleed' or 'existing_bleed'
        trim_width = float(request.form.get('trim_width', 6))
        trim_height = float(request.form.get('trim_height', 9))
        edge_type = request.form.get('edge_type', 'side-only')  # 'side-only' or 'all-edges'
        
        print(f"Received edge_type: '{edge_type}'")
        print(f"Available files: {list(request.files.keys())}")
        
        # Handle edge files based on edge_type
        edge_files = {}
        if edge_type == 'side-only':
            if 'edge' not in request.files or request.files['edge'].filename == '':
                return jsonify({"status": "error", "message": "Side edge file is required"}), 400
            edge_files['side'] = request.files['edge']
        else:  # all-edges
            required_edges = ['topEdge', 'edge', 'bottomEdge']  # topEdge, edge (side), bottomEdge
            for edge_name in required_edges:
                if edge_name not in request.files or request.files[edge_name].filename == '':
                    edge_display = edge_name.replace('Edge', ' Edge') if 'Edge' in edge_name else 'Side Edge'
                    return jsonify({"status": "error", "message": f"{edge_display} file is required for all-edges mode"}), 400
                edge_files[edge_name] = request.files[edge_name]
        
        # Save files temporarily
        pdf_temp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
        pdf_file.save(pdf_temp.name)
        
        edge_temps = {}
        for edge_name, edge_file in edge_files.items():
            temp_file = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
            edge_file.save(temp_file.name)
            edge_temps[edge_name] = temp_file.name
        
        # Process using file paths
        result = process_pdf_files_multi_edge(pdf_temp.name, edge_temps, trim_width, trim_height, num_pages, page_type, bleed_type, edge_type)
        
        # Cleanup temp files
        os.unlink(pdf_temp.name)
        for temp_path in edge_temps.values():
            os.unlink(temp_path)
        
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
    try:
        port = int(os.environ.get("PORT", 5001))
        print(f"Environment PORT: {os.environ.get('PORT', 'Not set')}")
        print(f"Starting server on port {port}")
        print(f"All environment variables: {dict(os.environ)}")
        app.run(debug=False, port=port, host="0.0.0.0")  # Disable debug in production
    except Exception as e:
        print(f"Failed to start server: {e}")
        import traceback
        traceback.print_exc()