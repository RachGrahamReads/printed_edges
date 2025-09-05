#!/bin/bash

# Start script for Python processing service

echo "Starting Printed Edges Python Processing Service..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install/update dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Start the Flask application
echo "Starting Flask service on port 5001..."
python app.py