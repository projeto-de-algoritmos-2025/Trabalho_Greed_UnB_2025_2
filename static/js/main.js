// Global variables
let selectedFiles = [];
let currentResults = null;

// DOM elements
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const fileSizeInfo = document.getElementById('file-size-info');
const compressBtn = document.getElementById('compress-btn');
const uploadSection = document.getElementById('upload-section');
const loadingSection = document.getElementById('loading-section');
const resultsSection = document.getElementById('results-section');
const newCompressionBtn = document.getElementById('new-compression-btn');
const decodeBtn = document.getElementById('decode-btn');
const decodeFileInput = document.getElementById('decode-file-input');
const decodeFileName = document.getElementById('decode-file-name');

// Mode switching elements
const compressModeBtn = document.getElementById('compress-mode-btn');
const decodeModeBtn = document.getElementById('decode-mode-btn');
const compressMode = document.getElementById('compress-mode');
const decodeMode = document.getElementById('decode-mode');
const decodeUploadInput = document.getElementById('decode-upload-input');
const decodeUploadInfo = document.getElementById('decode-upload-info');
const decodeUploadBtn = document.getElementById('decode-upload-btn');

// Variables for decode
let uploadedDecodeData = null;
let uploadedDecodeFilesFromHome = [];

// Mode switching
compressModeBtn.addEventListener('click', () => {
    compressModeBtn.classList.add('active');
    decodeModeBtn.classList.remove('active');
    compressMode.classList.remove('hidden');
    decodeMode.classList.add('hidden');
});

decodeModeBtn.addEventListener('click', () => {
    decodeModeBtn.classList.add('active');
    compressModeBtn.classList.remove('active');
    decodeMode.classList.remove('hidden');
    compressMode.classList.add('hidden');
});

// Handle decode file upload from home page (multiple files)
decodeUploadInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    uploadedDecodeFilesFromHome = [];

    decodeUploadInfo.innerHTML = `
        <div class="file-loading">
            <div class="spinner-small"></div>
            <span>Loading files...</span>
        </div>
    `;

    setTimeout(async () => {
        try {
            for (const file of files) {
                const arrayBuffer = await file.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);

                if (bytes.length >= 4) {
                    const metadataLength = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];

                    if (metadataLength > 0 && metadataLength < bytes.length) {
                        const metadataBytes = bytes.slice(4, 4 + metadataLength);
                        const metadataStr = new TextDecoder().decode(metadataBytes);
                        const metadata = JSON.parse(metadataStr);
                        const compressedBytes = bytes.slice(4 + metadataLength);

                        uploadedDecodeFilesFromHome.push({
                            ...metadata,
                            compressedBytes: compressedBytes,
                            isBinary: true,
                            huffFilename: file.name,
                            fileSize: file.size
                        });
                    }
                }
            }

            if (uploadedDecodeFilesFromHome.length === 0) {
                throw new Error('No valid .huff files found');
            }

            decodeUploadInfo.innerHTML = `
                <div class="file-items">
                    <h3>Selected Files (${uploadedDecodeFilesFromHome.length})</h3>
                    <ul>
                        ${uploadedDecodeFilesFromHome.map(file => `
                            <li>
                                <span class="file-name">✓ ${file.huffFilename}</span>
                                <span class="file-size">${formatBytes(file.fileSize)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
            decodeUploadBtn.disabled = false;
        } catch (error) {
            decodeUploadInfo.innerHTML = '<p class="error">Error: Invalid .huff files</p>';
            decodeUploadBtn.disabled = true;
            console.error(error);
        }
    }, 100);
});

// Client-side Huffman decoder for large files
function decodeHuffmanClientSide(binaryStr, codesTable) {
    // Build reverse lookup table
    const reverseTable = {};
    for (const [char, code] of Object.entries(codesTable)) {
        reverseTable[code] = char;
    }

    const decoded = [];
    let currentCode = '';
    const chunkSize = 100000; // Process 100k bits at a time

    for (let i = 0; i < binaryStr.length; i++) {
        currentCode += binaryStr[i];

        if (reverseTable[currentCode]) {
            decoded.push(reverseTable[currentCode]);
            currentCode = '';
        }

        // Yield control periodically to prevent UI freeze
        if (i % chunkSize === 0 && i > 0) {
            // Update progress
            const progress = Math.round((i / binaryStr.length) * 100);
            loadingSection.querySelector('.loading-box p').textContent = `Decoding file... ${progress}%`;
        }
    }

    return decoded.join('');
}

// Decode from home page (multiple files)
decodeUploadBtn.addEventListener('click', async () => {
    if (uploadedDecodeFilesFromHome.length === 0) return;

    // Clear previous results
    clearPreviousResults();

    // Check for large files
    const largeFiles = uploadedDecodeFilesFromHome.filter(f => f.compressedBytes.length / (1024 * 1024) > 20);
    if (largeFiles.length > 0) {
        const totalSizeMB = largeFiles.reduce((sum, f) => sum + f.compressedBytes.length, 0) / (1024 * 1024);
        if (!confirm(`You have ${largeFiles.length} large file(s) (${Math.round(totalSizeMB)}MB total). Decoding may take a while. Continue?`)) {
            return;
        }
    }

    // Show loading
    uploadSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');
    loadingSection.querySelector('.loading-box').innerHTML = `
        <div class="spinner"></div>
        <p>Decoding files... (0/${uploadedDecodeFilesFromHome.length})</p>
    `;

    setTimeout(async () => {
        try {
            const decodedFiles = [];
            let totalOriginalSize = 0;
            let totalCompressedSize = 0;

            for (let i = 0; i < uploadedDecodeFilesFromHome.length; i++) {
                const fileData = uploadedDecodeFilesFromHome[i];

                loadingSection.querySelector('.loading-box p').textContent =
                    `Decoding ${fileData.huffFilename}... (${i + 1}/${uploadedDecodeFilesFromHome.length})`;

                const binaryStr = bytesToBinaryString(
                    fileData.compressedBytes,
                    fileData.encoded_bits,
                    fileData.padding
                );

                const decodedText = decodeHuffmanClientSide(binaryStr, fileData.codes_table);

                decodedFiles.push({
                    ...fileData,
                    decodedText: decodedText
                });

                totalOriginalSize += fileData.original_size;
                totalCompressedSize += fileData.compressed_size;
            }

            // Store for downloads
            window.decodedFilesData = decodedFiles;

            // Show results
            loadingSection.classList.add('hidden');
            resultsSection.classList.remove('hidden');

            // Summary
            document.getElementById('original-size').textContent = formatBytes(totalOriginalSize);
            document.getElementById('compressed-size').textContent = formatBytes(totalCompressedSize);
            const totalRatio = ((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(2);
            document.getElementById('compression-ratio').textContent = totalRatio + '%';

            // Individual results
            const fileResultsHTML = `
                <div class="results-header">
                    <h3>Decode Results</h3>
                    ${decodedFiles.length > 1 ? `
                        <button class="btn btn-download-all" onclick="downloadAllDecodedFiles()">
                            📦 Download All as ZIP
                        </button>
                    ` : ''}
                </div>
                ${decodedFiles.map((file, index) => `
                    <div class="decoded-results-section">
                        <h4>${file.filename}</h4>
                        <div class="file-result">
                            <p>Original Size: ${formatBytes(file.original_size)}</p>
                            <p>Compressed Size: ${formatBytes(file.compressed_size)}</p>
                            <p>Compression Ratio: <strong>${file.compression_ratio}%</strong></p>
                            <p class="success-msg">✓ Successfully decoded!</p>
                        </div>
                        <div class="decoded-preview">
                            <h4>Text Preview (first 1000 characters):</h4>
                            <div class="decoded-text">${escapeHtml(file.decodedText.substring(0, 1000))}${file.decodedText.length > 1000 ? '\n\n... (text continues)' : ''}</div>
                        </div>
                        <div class="decoded-stats">
                            <p><strong>Total length:</strong> ${file.decodedText.length.toLocaleString()} characters</p>
                        </div>
                        <button class="btn btn-download" onclick="downloadSingleDecodedFile(${index})">
                            📥 Download Decoded Text
                        </button>
                    </div>
                `).join('')}
            `;

            document.getElementById('file-results').innerHTML = fileResultsHTML;

            // Hide tree and codes sections
            document.querySelector('.tree-section').style.display = 'none';
            document.querySelector('.codes-section').style.display = 'none';
            document.querySelector('.decode-section').style.display = 'none';
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred during decoding: ' + error.message);
            resetToUpload();
        }
    }, 100);
});

// File selection handler
fileInput.addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    displayFileList();
    updateFileSize();
    compressBtn.disabled = selectedFiles.length === 0;
});

// Display selected files
function displayFileList() {
    if (selectedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
    }

    const html = `
        <div class="file-items">
            <h3>Selected Files (${selectedFiles.length})</h3>
            <ul>
                ${selectedFiles.map(file => `
                    <li>
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${formatBytes(file.size)}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
    fileList.innerHTML = html;
}

// Update total file size
function updateFileSize() {
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    fileSizeInfo.innerHTML = `
        <p class="total-size">Total size: <strong>${formatBytes(totalSize)}</strong></p>
    `;
}

// Compress files
compressBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;

    // Clear previous results
    clearPreviousResults();

    // Show loading
    uploadSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');

    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files[]', file);
    });

    try {
        const response = await fetch('/compress', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            currentResults = data;
            displayResults(data);
        } else {
            alert('Error: ' + (data.error || 'Compression failed'));
            resetToUpload();
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred during compression');
        resetToUpload();
    }
});

// Display results
function displayResults(data) {
    loadingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    // Update summary
    document.getElementById('original-size').textContent = formatBytes(data.total_original_size);
    document.getElementById('compressed-size').textContent = formatBytes(data.total_compressed_size);
    document.getElementById('compression-ratio').textContent = data.total_compression_ratio + '%';

    // Display individual file results
    const fileResults = document.getElementById('file-results');
    fileResults.innerHTML = `
        <div class="results-header">
            <h3>Individual File Results</h3>
            ${data.results.filter(r => !r.error).length > 1 ? `
                <button class="btn btn-download-all" onclick="downloadAllFiles()">
                    📦 Download All Files as ZIP
                </button>
            ` : ''}
        </div>
        ${data.results.map((result, index) => `
            <div class="file-result">
                <h4>${result.filename}</h4>
                ${result.error ? `
                    <p class="error">${result.error}</p>
                ` : `
                    <p>Original: ${formatBytes(result.original_size)} → Compressed: ${formatBytes(result.compressed_size)}</p>
                    <p>Compression Ratio: <strong>${result.compression_ratio}%</strong></p>
                    <div class="download-buttons">
                        <button class="btn btn-download" onclick="downloadCompressedFile(${index})">
                            Download Compressed File (.huff)
                        </button>
                        <button class="btn btn-download btn-secondary-download" onclick="downloadCodesTable(${index})">
                            Download Codes Table (.json)
                        </button>
                    </div>
                `}
            </div>
        `).join('')}
    `;

    // Display tree visualization for first file
    const firstResult = data.results.find(r => !r.error);
    if (firstResult && firstResult.tree_structure) {
        drawHuffmanTree(firstResult.tree_structure);
        displayCodesTable(firstResult.codes_table);
    }

    // Note: Automatic downloads disabled for large files to prevent memory issues
    // Users can use the download button for each file
}

// Draw Huffman tree using D3.js
function drawHuffmanTree(treeData) {
    const container = document.getElementById('tree-container');
    container.innerHTML = '';

    // Calculate tree depth to adjust height
    const getDepth = (node) => {
        if (!node) return 0;
        const leftDepth = node.left ? getDepth(node.left) : 0;
        const rightDepth = node.right ? getDepth(node.right) : 0;
        return 1 + Math.max(leftDepth, rightDepth);
    };

    const treeDepth = getDepth(treeData);
    const width = Math.max(1600, treeDepth * 200);
    const height = Math.max(800, treeDepth * 150);

    const svg = d3.select('#tree-container')
        .append('svg')
        .attr('width', '100%')
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height])
        .attr('preserveAspectRatio', 'xMidYMid meet');

    // Add zoom capability
    const zoomBehavior = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoomBehavior);

    const g = svg.append('g')
        .attr('transform', 'translate(40, 60)');

    // Create tree layout with better spacing
    const treeLayout = d3.tree()
        .size([width - 120, height - 120])
        .separation((a, b) => (a.parent === b.parent ? 1.5 : 2.5));

    // Convert data to hierarchy
    const root = d3.hierarchy(treeData, d => {
        const children = [];
        if (d.left) children.push(d.left);
        if (d.right) children.push(d.right);
        return children.length > 0 ? children : null;
    });

    treeLayout(root);

    // Draw links
    g.selectAll('.link')
        .data(root.links())
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('d', d3.linkVertical()
            .x(d => d.x)
            .y(d => d.y))
        .attr('fill', 'none')
        .attr('stroke', '#555')
        .attr('stroke-width', 2);

    // Draw edge labels (0 and 1)
    g.selectAll('.edge-label')
        .data(root.links())
        .enter()
        .append('text')
        .attr('class', 'edge-label')
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2)
        .attr('dx', d => d.target.x < d.source.x ? -10 : 10)
        .attr('dy', -5)
        .text(d => {
            // Left child = 0, Right child = 1
            if (d.source.children) {
                return d.source.children[0] === d.target ? '0' : '1';
            }
            return '';
        })
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('fill', '#2196F3');

    // Draw nodes
    const nodes = g.selectAll('.node')
        .data(root.descendants())
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`);

    // Node circles
    nodes.append('circle')
        .attr('r', 20)
        .attr('fill', d => d.data.char ? '#64B5F6' : '#333')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);

    // Node labels (frequency above node)
    nodes.append('text')
        .attr('dy', -28)
        .attr('text-anchor', 'middle')
        .text(d => d.data.freq)
        .attr('font-size', '11px')
        .attr('fill', '#333')
        .attr('font-weight', '600');

    // Character labels (for leaf nodes)
    nodes.append('text')
        .attr('dy', 5)
        .attr('text-anchor', 'middle')
        .text(d => d.data.char || '')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#fff');

    // Add initial zoom to fit
    const bounds = g.node().getBBox();
    const fullWidth = width;
    const fullHeight = height;
    const midX = bounds.x + bounds.width / 2;
    const midY = bounds.y + bounds.height / 2;
    const scale = 0.9 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

    svg.call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
}

// Display codes table
function displayCodesTable(codes) {
    const container = document.getElementById('codes-table');

    const sortedCodes = Object.entries(codes).sort((a, b) => a[1].length - b[1].length);

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Character</th>
                    <th>Huffman Code</th>
                    <th>Code Length</th>
                </tr>
            </thead>
            <tbody>
                ${sortedCodes.map(([char, code]) => `
                    <tr>
                        <td class="char-cell">${char === ' ' ? '(space)' : char === '\n' ? '(newline)' : char}</td>
                        <td class="code-cell">${code}</td>
                        <td>${code.length}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Convert bytes back to binary string (optimized for large files)
function bytesToBinaryString(bytes, totalBits, padding) {
    // Use array and join for better memory efficiency
    const chunks = [];
    const chunkSize = 10000; // Process 10k bytes at a time

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, bytes.length);
        const chunk = [];

        for (let j = i; j < end; j++) {
            chunk.push(bytes[j].toString(2).padStart(8, '0'));
        }

        chunks.push(chunk.join(''));
    }

    let binaryStr = chunks.join('');

    // Remove padding bits from the end
    if (padding > 0) {
        binaryStr = binaryStr.slice(0, -padding);
    }

    return binaryStr;
}

// Show loading indicator
function showDecodeLoading(show) {
    if (show) {
        decodeFileName.innerHTML = `
            <div class="file-loading">
                <div class="spinner-small"></div>
                <span>Loading file...</span>
            </div>
        `;
    }
}

// Handle decode file upload (results page - multiple files)
decodeFileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    showDecodeLoading(true);

    // Use setTimeout to allow UI to update
    setTimeout(async () => {
        try {
            uploadedDecodeData = [];

            for (const file of files) {
                const arrayBuffer = await file.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);

                // Try to read as binary format first
                if (bytes.length >= 4) {
                    // Read header (4 bytes = metadata length)
                    const metadataLength = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];

                    if (metadataLength > 0 && metadataLength < bytes.length) {
                        // Extract metadata
                        const metadataBytes = bytes.slice(4, 4 + metadataLength);
                        const metadataStr = new TextDecoder().decode(metadataBytes);
                        const metadata = JSON.parse(metadataStr);

                        // Extract compressed data
                        const compressedBytes = bytes.slice(4 + metadataLength);

                        // Store raw bytes instead of converting to string immediately
                        uploadedDecodeData.push({
                            ...metadata,
                            compressedBytes: compressedBytes,
                            isBinary: true,
                            huffFilename: file.name,
                            fileSize: file.size
                        });
                        continue;
                    }
                }

                // Fallback: try old text format
                const text = new TextDecoder().decode(bytes);

                if (text.includes('---ENCODED_DATA---')) {
                    const parts = text.split('---ENCODED_DATA---');
                    const metadata = JSON.parse(parts[0].trim());
                    const encodedData = parts[1].trim();

                    uploadedDecodeData.push({
                        ...metadata,
                        encoded: encodedData,
                        isBinary: false,
                        huffFilename: file.name,
                        fileSize: file.size
                    });
                } else {
                    // Old format - plain JSON
                    const data = JSON.parse(text);
                    uploadedDecodeData.push({
                        ...data,
                        isBinary: false,
                        huffFilename: file.name,
                        fileSize: file.size
                    });
                }
            }

            if (uploadedDecodeData.length === 0) {
                throw new Error('No valid .huff files');
            }

            decodeFileName.innerHTML = `
                <div class="file-uploaded-list">
                    <p class="file-uploaded">✓ Loaded ${uploadedDecodeData.length} file(s)</p>
                    <ul class="mini-file-list">
                        ${uploadedDecodeData.map(f => `
                            <li>${f.huffFilename} (${formatBytes(f.fileSize)})</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        } catch (error) {
            decodeFileName.innerHTML = '';
            alert('Error reading files. Please ensure they are valid .huff files.');
            console.error(error);
        }
    }, 100);
});

// Decode functionality (results page - handles multiple files)
decodeBtn.addEventListener('click', async () => {
    const decodedOutput = document.getElementById('decoded-output');

    // Show loading
    decodedOutput.innerHTML = `
        <div class="decode-loading">
            <div class="spinner"></div>
            <p>Decoding...</p>
        </div>
    `;

    // Use setTimeout to allow UI to update
    setTimeout(async () => {
        try {
            // Check if files were uploaded
            if (uploadedDecodeData && Array.isArray(uploadedDecodeData) && uploadedDecodeData.length > 0) {
                // Multiple files uploaded
                const decodedFiles = [];

                for (let i = 0; i < uploadedDecodeData.length; i++) {
                    const fileData = uploadedDecodeData[i];

                    decodedOutput.querySelector('.decode-loading p').textContent =
                        `Decoding ${fileData.huffFilename}... (${i + 1}/${uploadedDecodeData.length})`;

                    let binaryStr;
                    if (fileData.isBinary) {
                        binaryStr = bytesToBinaryString(
                            fileData.compressedBytes,
                            fileData.encoded_bits,
                            fileData.padding
                        );
                    } else {
                        binaryStr = fileData.encoded;
                    }

                    const decodedText = decodeHuffmanClientSide(binaryStr, fileData.codes_table);

                    decodedFiles.push({
                        filename: fileData.filename,
                        huffFilename: fileData.huffFilename,
                        decodedText: decodedText
                    });
                }

                // Store for downloads
                window.decodedFilesDataFromResults = decodedFiles;

                // Display results
                decodedOutput.innerHTML = `
                    <div class="decode-results-container">
                        <div class="results-header">
                            <h4>Decoded Files</h4>
                            ${decodedFiles.length > 1 ? `
                                <button class="btn btn-download-all" onclick="downloadAllDecodedFilesFromResults()">
                                    📦 Download All as ZIP
                                </button>
                            ` : ''}
                        </div>
                        ${decodedFiles.map((file, index) => `
                            <div class="decoded-file-result">
                                <h5>${file.filename}</h5>
                                <div class="decoded-text-preview">${escapeHtml(file.decodedText.substring(0, 500))}${file.decodedText.length > 500 ? '...' : ''}</div>
                                <p><strong>Length:</strong> ${file.decodedText.length.toLocaleString()} characters</p>
                                <button class="btn btn-download" onclick="downloadDecodedFileFromResults(${index})">Download Decoded Text</button>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else if (uploadedDecodeData && uploadedDecodeData.isBinary) {
                // Single file (old format support)
                const binaryStr = bytesToBinaryString(
                    uploadedDecodeData.compressedBytes,
                    uploadedDecodeData.encoded_bits,
                    uploadedDecodeData.padding
                );
                const decodedText = decodeHuffmanClientSide(binaryStr, uploadedDecodeData.codes_table);

                window.singleDecodedText = decodedText;

                decodedOutput.innerHTML = `
                    <h4>Decoded Text:</h4>
                    <div class="decoded-text">${escapeHtml(decodedText.substring(0, 5000))}${decodedText.length > 5000 ? '...' : ''}</div>
                    <p><strong>Length:</strong> ${decodedText.length.toLocaleString()} characters</p>
                    <button class="btn btn-download" onclick="downloadSingleDecodedTextFromResults()">Download Decoded Text</button>
                `;
            } else {
                // Use pasted data
                const encodedInput = document.getElementById('encoded-input').value;

                if (!encodedInput || !currentResults) {
                    decodedOutput.innerHTML = '';
                    alert('Please upload .huff file(s) or paste encoded data');
                    return;
                }

                const firstResult = currentResults.results.find(r => !r.error);
                if (!firstResult) {
                    decodedOutput.innerHTML = '';
                    alert('No valid compression results available');
                    return;
                }

                const decodedText = decodeHuffmanClientSide(encodedInput, firstResult.codes_table);
                window.singleDecodedText = decodedText;

                decodedOutput.innerHTML = `
                    <h4>Decoded Text:</h4>
                    <div class="decoded-text">${escapeHtml(decodedText.substring(0, 5000))}${decodedText.length > 5000 ? '...' : ''}</div>
                    <p><strong>Length:</strong> ${decodedText.length.toLocaleString()} characters</p>
                    <button class="btn btn-download" onclick="downloadSingleDecodedTextFromResults()">Download Decoded Text</button>
                `;
            }
        } catch (error) {
            console.error('Error:', error);
            decodedOutput.innerHTML = '';
            alert('An error occurred during decoding: ' + error.message);
        }
    }, 100);
});

// Download all decoded files from results page
async function downloadAllDecodedFilesFromResults() {
    if (!window.decodedFilesDataFromResults || !window.JSZip) {
        alert('No decoded files available');
        return;
    }

    try {
        const zip = new JSZip();

        for (const file of window.decodedFilesDataFromResults) {
            const filename = file.filename.replace('.txt', '_decoded.txt');
            zip.file(filename, file.decodedText);
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'decoded_files.zip';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    } catch (error) {
        console.error('Error creating ZIP:', error);
        alert('Failed to create ZIP file: ' + error.message);
    }
}

// Download single decoded file from results page
function downloadDecodedFileFromResults(index) {
    if (!window.decodedFilesDataFromResults || !window.decodedFilesDataFromResults[index]) {
        alert('File not available');
        return;
    }

    const file = window.decodedFilesDataFromResults[index];
    const blob = new Blob([file.decodedText], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename.replace('.txt', '_decoded.txt');
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Download single decoded text from results page (for pasted data or old format)
function downloadSingleDecodedTextFromResults() {
    if (!window.singleDecodedText) {
        alert('No decoded text available');
        return;
    }

    const blob = new Blob([window.singleDecodedText], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'decoded_text.txt';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Download decoded text (legacy function)
function downloadDecodedText() {
    const decodedText = document.querySelector('.decoded-text').textContent;
    const blob = new Blob([decodedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'decoded_text.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Clear previous results
function clearPreviousResults() {
    // Clear results section
    document.getElementById('file-results').innerHTML = '';
    document.getElementById('original-size').textContent = '0 bytes';
    document.getElementById('compressed-size').textContent = '0 bytes';
    document.getElementById('compression-ratio').textContent = '0%';

    // Remove any previous decoded results sections
    const oldDecodedSections = document.querySelectorAll('.decoded-results-section');
    oldDecodedSections.forEach(section => section.remove());

    // Reset tree and codes sections
    document.getElementById('tree-container').innerHTML = '';
    document.getElementById('codes-table').innerHTML = '';
    document.getElementById('decoded-output').innerHTML = '';

    // Show tree and codes sections (they'll be hidden later if not needed)
    document.querySelector('.tree-section').style.display = 'block';
    document.querySelector('.codes-section').style.display = 'block';
    document.querySelector('.decode-section').style.display = 'block';

    // Clear global data
    window.currentDecodedText = null;
    window.decodedFilesData = null;
    currentResults = null;
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Download all compressed files as ZIP
async function downloadAllFiles() {
    if (!currentResults || !window.JSZip) {
        alert('Unable to create ZIP file');
        return;
    }

    try {
        const zip = new JSZip();
        const validResults = currentResults.results.filter(r => !r.error);

        for (let i = 0; i < validResults.length; i++) {
            const result = validResults[i];
            const encodedData = result.encoded_full || result.encoded;
            const { bytes, paddingLength } = binaryStringToBytes(encodedData);

            // Create metadata
            const compressionData = {
                filename: result.filename,
                codes_table: result.codes_table,
                original_size: result.original_size,
                compressed_size: result.compressed_size,
                compression_ratio: result.compression_ratio,
                encoded_bits: encodedData.length,
                padding: paddingLength
            };

            // Create .huff file
            const metadataStr = JSON.stringify(compressionData);
            const metadataBytes = new TextEncoder().encode(metadataStr);
            const headerBytes = new Uint8Array(4);
            const metadataLength = metadataBytes.length;
            headerBytes[0] = (metadataLength >> 24) & 0xFF;
            headerBytes[1] = (metadataLength >> 16) & 0xFF;
            headerBytes[2] = (metadataLength >> 8) & 0xFF;
            headerBytes[3] = metadataLength & 0xFF;

            const totalLength = headerBytes.length + metadataBytes.length + bytes.length;
            const combinedBytes = new Uint8Array(totalLength);
            combinedBytes.set(headerBytes, 0);
            combinedBytes.set(metadataBytes, headerBytes.length);
            combinedBytes.set(bytes, headerBytes.length + metadataBytes.length);

            zip.file(result.filename.replace('.txt', '_compressed.huff'), combinedBytes);

            // Create codes table JSON
            const codesData = {
                filename: result.filename,
                codes_table: result.codes_table,
                tree_structure: result.tree_structure,
                statistics: {
                    original_size: result.original_size,
                    compressed_size: result.compressed_size,
                    compression_ratio: result.compression_ratio
                }
            };
            zip.file(result.filename.replace('.txt', '_codes.json'), JSON.stringify(codesData, null, 2));
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'huffman_compressed_files.zip';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('Downloaded all files as ZIP');
    } catch (error) {
        console.error('Error creating ZIP:', error);
        alert('Failed to create ZIP file: ' + error.message);
    }
}

// Download all decoded files as ZIP
async function downloadAllDecodedFiles() {
    if (!window.decodedFilesData || !window.JSZip) {
        alert('No decoded files available');
        return;
    }

    try {
        const zip = new JSZip();

        for (const file of window.decodedFilesData) {
            const filename = file.filename.replace('.txt', '_decoded.txt');
            zip.file(filename, file.decodedText);
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'huffman_decoded_files.zip';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('Downloaded all decoded files as ZIP');
    } catch (error) {
        console.error('Error creating ZIP:', error);
        alert('Failed to create ZIP file: ' + error.message);
    }
}

// Download single decoded file
function downloadSingleDecodedFile(index) {
    if (!window.decodedFilesData || !window.decodedFilesData[index]) {
        alert('File not available');
        return;
    }

    const file = window.decodedFilesData[index];
    const blob = new Blob([file.decodedText], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename.replace('.txt', '_decoded.txt');
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Download decoded text from home page decode
function downloadDecodedTextFromHome(originalFilename) {
    const decodedText = window.currentDecodedText;
    if (!decodedText) {
        alert('No decoded text available');
        return;
    }

    try {
        const blob = new Blob([decodedText], { type: 'text/plain; charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = originalFilename.replace('_compressed.huff', '.txt').replace('.huff', '_decoded.txt');
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('Downloaded decoded text:', a.download);
    } catch (error) {
        console.error('Download error:', error);
        alert('Failed to download file: ' + error.message);
    }
}

// New compression
newCompressionBtn.addEventListener('click', resetToUpload);

function resetToUpload() {
    resultsSection.classList.add('hidden');
    loadingSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');

    fileInput.value = '';
    selectedFiles = [];
    currentResults = null;
    displayFileList();
    updateFileSize();
    compressBtn.disabled = true;
}

// Convert binary string to actual bytes
function binaryStringToBytes(binaryStr) {
    // Pad to make length multiple of 8
    const paddingLength = (8 - (binaryStr.length % 8)) % 8;
    const paddedBinaryStr = binaryStr + '0'.repeat(paddingLength);

    const bytes = new Uint8Array(paddedBinaryStr.length / 8);

    for (let i = 0; i < bytes.length; i++) {
        const byteStr = paddedBinaryStr.substr(i * 8, 8);
        bytes[i] = parseInt(byteStr, 2);
    }

    return { bytes, paddingLength };
}

// Download compressed file
function downloadCompressedFile(index) {
    if (!currentResults || !currentResults.results[index]) return;

    const result = currentResults.results[index];
    if (result.error) return;

    // Show download in progress
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = 'Preparing download...';
    button.disabled = true;

    setTimeout(() => {
        try {
            // Convert binary string to actual bytes
            const encodedData = result.encoded_full || result.encoded;
            const { bytes, paddingLength } = binaryStringToBytes(encodedData);

        // Create metadata
        const compressionData = {
            filename: result.filename,
            codes_table: result.codes_table,
            original_size: result.original_size,
            compressed_size: result.compressed_size,
            compression_ratio: result.compression_ratio,
            encoded_bits: encodedData.length,
            padding: paddingLength
        };

        // Convert metadata to JSON and then to bytes
        const metadataStr = JSON.stringify(compressionData);
        const metadataBytes = new TextEncoder().encode(metadataStr);

        // Create header with metadata length (4 bytes)
        const headerBytes = new Uint8Array(4);
        const metadataLength = metadataBytes.length;
        headerBytes[0] = (metadataLength >> 24) & 0xFF;
        headerBytes[1] = (metadataLength >> 16) & 0xFF;
        headerBytes[2] = (metadataLength >> 8) & 0xFF;
        headerBytes[3] = metadataLength & 0xFF;

        // Combine: header + metadata + compressed data
        const totalLength = headerBytes.length + metadataBytes.length + bytes.length;
        const combinedBytes = new Uint8Array(totalLength);
        combinedBytes.set(headerBytes, 0);
        combinedBytes.set(metadataBytes, headerBytes.length);
        combinedBytes.set(bytes, headerBytes.length + metadataBytes.length);

        // Create blob and download
        const blob = new Blob([combinedBytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename.replace('.txt', '_compressed.huff');
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

            console.log(`Downloaded ${result.filename} - Original: ${formatBytes(result.original_size)}, Compressed: ${formatBytes(blob.size)}`);

            // Reset button
            button.textContent = originalText;
            button.disabled = false;
        } catch (error) {
            console.error('Download error:', error);
            alert(`Failed to download file: ${error.message}. File may be too large for browser memory.`);
            button.textContent = originalText;
            button.disabled = false;
        }
    }, 100);
}

// Download codes table as JSON
function downloadCodesTable(index) {
    if (!currentResults || !currentResults.results[index]) return;

    const result = currentResults.results[index];
    if (result.error) return;

    try {
        const codesData = {
            filename: result.filename,
            codes_table: result.codes_table,
            tree_structure: result.tree_structure,
            statistics: {
                original_size: result.original_size,
                compressed_size: result.compressed_size,
                compression_ratio: result.compression_ratio
            },
            note: "This file contains the Huffman codes table and tree structure. Use it with the .huff file to decode the compressed data."
        };

        const jsonString = JSON.stringify(codesData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename.replace('.txt', '_codes.json');
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log(`Downloaded codes table for ${result.filename}`);
    } catch (error) {
        console.error('Download error:', error);
        alert(`Failed to download codes table: ${error.message}`);
    }
}

// Utility function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
