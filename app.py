"""
Flask Application for Huffman Coding Compression
"""
from flask import Flask, render_template, request, jsonify
import os
from werkzeug.utils import secure_filename
from huffman import HuffmanCoding
import json

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() == 'txt'


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/compress', methods=['POST'])
def compress():
    try:
        if 'files[]' not in request.files:
            return jsonify({'error': 'No files uploaded'}), 400

        files = request.files.getlist('files[]')

        if not files or files[0].filename == '':
            return jsonify({'error': 'No files selected'}), 400

        results = []
        total_original_size = 0
        total_compressed_size = 0

        for file in files:
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)

                # Read file content
                content = file.read().decode('utf-8')
                original_size = len(content.encode('utf-8'))
                total_original_size += original_size

                # Create Huffman tree and encode
                huffman = HuffmanCoding()
                huffman.build_tree(content)
                encoded = huffman.encode(content)

                # Calculate compressed size (in bits, converted to bytes)
                compressed_size_bits = len(encoded)
                compressed_size_bytes = (compressed_size_bits + 7) // 8  # Round up to nearest byte
                total_compressed_size += compressed_size_bytes

                # Get codes table
                codes_table = huffman.get_codes_table()
                tree_structure = huffman.get_tree_structure()

                results.append({
                    'filename': filename,
                    'original_size': original_size,
                    'compressed_size': compressed_size_bytes,
                    'compression_ratio': round((1 - compressed_size_bytes / original_size) * 100, 2) if original_size > 0 else 0,
                    'codes_table': codes_table,
                    'tree_structure': tree_structure,
                    'encoded': encoded[:1000] + '...' if len(encoded) > 1000 else encoded,  # Truncate for display
                    'encoded_full': encoded  # Full encoded data for download
                })
            else:
                results.append({
                    'filename': file.filename,
                    'error': 'Invalid file type. Only .txt files are allowed.'
                })

        return jsonify({
            'success': True,
            'results': results,
            'total_original_size': total_original_size,
            'total_compressed_size': total_compressed_size,
            'total_compression_ratio': round((1 - total_compressed_size / total_original_size) * 100, 2) if total_original_size > 0 else 0
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/decode', methods=['POST'])
def decode():
    try:
        data = request.get_json()
        encoded_text = data.get('encoded')
        codes_table = data.get('codes_table')

        if not encoded_text or not codes_table:
            return jsonify({'error': 'Missing encoded text or codes table'}), 400

        # Rebuild Huffman tree from codes table
        # For simplicity, we'll use reverse lookup for decoding
        reverse_codes = {v: k for k, v in codes_table.items()}

        decoded = []
        current_code = ''

        for bit in encoded_text:
            current_code += bit
            if current_code in reverse_codes:
                decoded.append(reverse_codes[current_code])
                current_code = ''

        decoded_text = ''.join(decoded)

        return jsonify({
            'success': True,
            'decoded': decoded_text
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
