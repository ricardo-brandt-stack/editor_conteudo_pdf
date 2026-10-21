pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ESTADOS DA APLICAÇÃO
let originalPdfBytes = null;
let pdfDocJs = null;
let currentPageNum = 1;
let totalPages = 1;
let currentTool = 'select'; // 'select', 'erase', 'text'

// ARMAZENAMENTO DAS EDIÇÕES: { pageIndex: [ { type: 'erase'|'text', ... } ] }
let pageAnnotations = {};

// ELEMENTOS DOM
const themeToggleBtn = document.getElementById('theme-toggle');
const dropZone = document.getElementById('drop-zone');
const pdfInput = document.getElementById('pdf-input');
const editorLayout = document.getElementById('editor-layout');
const statusText = document.getElementById('status-text');

const renderCanvas = document.getElementById('pdf-render-canvas');
const overlay = document.getElementById('annotation-overlay');

const toolSelect = document.getElementById('tool-select');
const toolErase = document.getElementById('tool-erase');
const toolText = document.getElementById('tool-text');

const eraseOptions = document.getElementById('erase-options');
const textOptions = document.getElementById('text-options');

const btnPrevPage = document.getElementById('btn-prev-page');
const btnNextPage = document.getElementById('btn-next-page');
const currentPageEl = document.getElementById('current-page-num');
const totalPagesEl = document.getElementById('total-pages-num');

const btnUndo = document.getElementById('btn-undo');
const btnReset = document.getElementById('btn-reset');
const btnExport = document.getElementById('btn-export');

// 1. TEMA CLARO/ESCURO
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeToggleBtn.innerText = isLight ? '☀️ Claro' : '🌙 Escuro';
    });
}

// 2. SELEÇÃO DE FERRAMENTAS
function setActiveTool(tool) {
    currentTool = tool;
    [toolSelect, toolErase, toolText].forEach(btn => btn.classList.remove('active'));
    eraseOptions.style.display = 'none';
    textOptions.style.display = 'none';

    if (tool === 'select') {
        toolSelect.classList.add('active');
        overlay.style.cursor = 'default';
    } else if (tool === 'erase') {
        toolErase.classList.add('active');
        eraseOptions.style.display = 'block';
        overlay.style.cursor = 'crosshair';
    } else if (tool === 'text') {
        toolText.classList.add('active');
        textOptions.style.display = 'block';
        overlay.style.cursor = 'text';
    }
}

toolSelect.addEventListener('click', () => setActiveTool('select'));
toolErase.addEventListener('click', () => setActiveTool('erase'));
toolText.addEventListener('click', () => setActiveTool('text'));

// 3. CARREGAR DOCUMENTO PDF
dropZone.addEventListener('click', () => pdfInput.click());
pdfInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) loadPdf(e.target.files[0]);
});

dropZone.addEventListener('dragover', (e) => e.preventDefault());
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) loadPdf(e.dataTransfer.files[0]);
});

async function loadPdf(file) {
    statusText.innerText = 'Carregando arquivo PDF...';
    originalPdfBytes = await file.arrayBuffer();
    
    pdfDocJs = await pdfjsLib.getDocument({ data: originalPdfBytes.slice(0) }).promise;
    totalPages = pdfDocJs.numPages;
    currentPageNum = 1;

    totalPagesEl.innerText = totalPages;
    pageAnnotations = {};

    dropZone.style.display = 'none';
    editorLayout.style.display = 'flex';
    statusText.innerText = '';

    setActiveTool('select');
    renderPage(currentPageNum);
}

// 4. RENDERIZAÇÃO DA PÁGINA NO CANVAS
async function renderPage(pageNum) {
    currentPageEl.innerText = pageNum;
    const page = await pdfDocJs.getPage(pageNum);
    
    const viewport = page.getViewport({ scale: 1.5 });
    const context = renderCanvas.getContext('2d');
    
    renderCanvas.height = viewport.height;
    renderCanvas.width = viewport.width;

    overlay.style.width = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    drawAnnotationsOnOverlay();
}

// 5. NAVEGAÇÃO ENTRE PÁGINAS
btnPrevPage.addEventListener('click', () => {
    if (currentPageNum > 1) {
        currentPageNum--;
        renderPage(currentPageNum);
    }
});

btnNextPage.addEventListener('click', () => {
    if (currentPageNum < totalPages) {
        currentPageNum++;
        renderPage(currentPageNum);
    }
});

// 6. INTERAÇÃO E DESENHO NA OVERLAY (APAGAR OU INSERIR TEXTO)
let isDrawing = false;
let startX = 0, startY = 0;
let tempBox = null;

overlay.addEventListener('mousedown', (e) => {
    const rect = overlay.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (currentTool === 'erase') {
        isDrawing = true;
        tempBox = document.createElement('div');
        tempBox.className = 'drawn-box';
        tempBox.style.left = `${startX}px`;
        tempBox.style.top = `${startY}px`;
        overlay.appendChild(tempBox);
    } else if (currentTool === 'text') {
        const textVal = document.getElementById('input-new-text').value;
        if (!textVal.trim()) {
            alert('Digite o texto a ser inserido no campo do painel lateral!');
            return;
        }

        const fontSize = parseInt(document.getElementById('input-font-size').value, 10) || 14;
        const color = document.getElementById('input-text-color').value;

        addAnnotation(currentPageNum, {
            type: 'text',
            x: startX,
            y: startY,
            text: textVal,
            fontSize: fontSize,
            color: color
        });
        drawAnnotationsOnOverlay();
    }
});

overlay.addEventListener('mousemove', (e) => {
    if (!isDrawing || !tempBox) return;
    const rect = overlay.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    tempBox.style.width = `${width}px`;
    tempBox.style.height = `${height}px`;
    tempBox.style.left = `${Math.min(startX, currentX)}px`;
    tempBox.style.top = `${Math.min(startY, currentY)}px`;
});

overlay.addEventListener('mouseup', (e) => {
    if (isDrawing && tempBox) {
        isDrawing = false;
        const rect = overlay.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        overlay.removeChild(tempBox);
        tempBox = null;

        if (width > 5 && height > 5) {
            const eraseColor = document.getElementById('erase-color').value;
            addAnnotation(currentPageNum, {
                type: 'erase',
                x: x,
                y: y,
                width: width,
                height: height,
                color: eraseColor
            });
            drawAnnotationsOnOverlay();
        }
    }
});

function addAnnotation(pageNum, annotation) {
    if (!pageAnnotations[pageNum]) {
        pageAnnotations[pageNum] = [];
    }
    pageAnnotations[pageNum].push(annotation);
}

// REDESENHA AS ANOTAÇÕES NA OVERLAY
function drawAnnotationsOnOverlay() {
    overlay.innerHTML = '';
    const annotations = pageAnnotations[currentPageNum] || [];

    annotations.forEach(item => {
        if (item.type === 'erase') {
            const box = document.createElement('div');
            box.className = 'erase-box';
            box.style.left = `${item.x}px`;
            box.style.top = `${item.y}px`;
            box.style.width = `${item.width}px`;
            box.style.height = `${item.height}px`;
            box.style.backgroundColor = item.color === 'white' ? '#ffffff' : '#000000';
            overlay.appendChild(box);
        } else if (item.type === 'text') {
            const txt = document.createElement('div');
            txt.className = 'text-box';
            txt.style.left = `${item.x}px`;
            txt.style.top = `${item.y}px`;
            txt.style.fontSize = `${item.fontSize}px`;
            txt.style.color = item.color;
            txt.innerText = item.text;
            overlay.appendChild(txt);
        }
    });
}

// DESFAZER & REINICIAR
btnUndo.addEventListener('click', () => {
    if (pageAnnotations[currentPageNum] && pageAnnotations[currentPageNum].length > 0) {
        pageAnnotations[currentPageNum].pop();
        drawAnnotationsOnOverlay();
    }
});

btnReset.addEventListener('click', () => {
    pageAnnotations = {};
    drawAnnotationsOnOverlay();
});

// 7. COMPILAÇÃO E EXPORTAÇÃO DO PDF FINAL MODIFICADO
btnExport.addEventListener('click', async () => {
    statusText.innerText = 'Gerando arquivo PDF final editado...';
    const { PDFDocument, rgb } = PDFLib;
    
    const pdfLibDoc = await PDFDocument.load(originalPdfBytes);
    const pages = pdfLibDoc.getPages();

    // Loop por todas as páginas anotadas
    for (const [pageNumStr, annotations] of Object.entries(pageAnnotations)) {
        const pageIdx = parseInt(pageNumStr, 10) - 1;
        const page = pages[pageIdx];
        const { width: pdfPageWidth, height: pdfPageHeight } = page.getSize();

        // Proporção entre o Canvas do navegador e o PDF real
        const scaleX = pdfPageWidth / renderCanvas.width;
        const scaleY = pdfPageHeight / renderCanvas.height;

        for (const item of annotations) {
            if (item.type === 'erase') {
                const pdfX = item.x * scaleX;
                const pdfY = pdfPageHeight - (item.y * scaleY) - (item.height * scaleY);
                const pdfWidth = item.width * scaleX;
                const pdfHeight = item.height * scaleY;

                const colorFill = item.color === 'white' ? rgb(1, 1, 1) : rgb(0, 0, 0);

                page.drawRectangle({
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                    color: colorFill
                });
            } else if (item.type === 'text') {
                const pdfX = item.x * scaleX;
                const pdfY = pdfPageHeight - (item.y * scaleY) - (item.fontSize * scaleY);

                // Converte cor Hex (#000000) para RGB (0-1)
                const hex = item.color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16) / 255;
                const g = parseInt(hex.substring(2, 4), 16) / 255;
                const b = parseInt(hex.substring(4, 6), 16) / 255;

                page.drawText(item.text, {
                    x: pdfX,
                    y: pdfY,
                    size: item.fontSize * scaleY,
                    color: rgb(r, g, b)
                });
            }
        }
    }

    const modifiedPdfBytes = await pdfLibDoc.save();
    const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pdf_editado_escriba.pdf';
    link.click();

    statusText.innerText = 'Download iniciado!';
    setTimeout(() => { statusText.innerText = ''; }, 3000);
});