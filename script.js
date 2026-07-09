const state = {
  file: null,
  convertedHtml: "",
  previewHtml: "",
  extracted: null,
};

const fileInput = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const fileMeta = document.querySelector("#fileMeta");
const convertButton = document.querySelector("#convertButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const downloadPreviewButton = document.querySelector("#downloadPreviewButton");
const titleInput = document.querySelector("#titleInput");
const templateMode = document.querySelector("#templateMode");
const imageUrlsInput = document.querySelector("#imageUrlsInput");
const videoUrlInput = document.querySelector("#videoUrlInput");
const sourceInput = document.querySelector("#sourceInput");
const preview = document.querySelector("#preview");
const htmlOutput = document.querySelector("#htmlOutput");
const convertStatus = document.querySelector("#convertStatus");

const NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};

const PRODUCT_RULES = [
  {
    pattern: /Nexweet®?\s*Allulose/g,
    html: '<a href="https://samyangspecialty.com/en/product/Ingredients/allulose" target="_blank"><span style="font-style:italic; color:#B43993;"><u>Nexweet® Allulose</u></span></a>',
  },
  {
    pattern: /Fiberest®?\s*Resistant\s*Dextrin/gi,
    html: '<a href="https://samyangspecialty.com/en/product/Ingredients/dietary-fiber" target="_blank"><span style="font-style:italic; color:#397b21;"><u>Fiberest® Resistant Dextrin</u></span></a>',
  },
  {
    pattern: /Fibernova®?\s*Kestose/g,
    html: '<span style="font-style:italic; color:#397b21;">Fibernova® Kestose</span>',
  },
];

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) setFile(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
});

dropzone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) setFile(file);
});

convertButton.addEventListener("click", async () => {
  if (!state.file) return;

  setStatus("변환 중...");
  setButtons(false);

  try {
    state.extracted = await readFile(state.file);
    const finalHtml = buildAdminHtml(state.extracted);
    const previewDocument = buildPreviewDocument(finalHtml);

    state.convertedHtml = finalHtml;
    state.previewHtml = previewDocument;
    htmlOutput.value = finalHtml;
    preview.innerHTML = finalHtml;
    setStatus("변환 완료");
    setButtons(true);
    updateFileMeta(state.extracted);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "변환에 실패했습니다.", true);
    setButtons(false);
  }
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.convertedHtml);
  setStatus("HTML 복사 완료");
});

downloadButton.addEventListener("click", () => {
  downloadText("newsroom-upload.html", state.convertedHtml);
});

downloadPreviewButton.addEventListener("click", () => {
  downloadText("newsroom-preview.html", state.previewHtml);
});

function setFile(file) {
  state.file = file;
  state.convertedHtml = "";
  state.previewHtml = "";
  state.extracted = null;
  htmlOutput.value = "";
  preview.innerHTML = '<p class="empty-state">변환하기를 누르면 결과가 표시됩니다.</p>';
  fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  convertButton.disabled = false;
  copyButton.disabled = true;
  downloadButton.disabled = true;
  downloadPreviewButton.disabled = true;
  setStatus("파일 준비됨");
}

function setButtons(hasOutput) {
  convertButton.disabled = !state.file;
  copyButton.disabled = !hasOutput;
  downloadButton.disabled = !hasOutput;
  downloadPreviewButton.disabled = !hasOutput;
}

function setStatus(message, isError = false) {
  convertStatus.textContent = message;
  convertStatus.classList.toggle("error", isError);
}

function updateFileMeta(extracted) {
  const notes = [
    `${state.file.name} · ${formatBytes(state.file.size)}`,
    `${extracted.format.toUpperCase()}`,
    `텍스트 ${extracted.blocks.length}개`,
  ];
  if (extracted.mediaCount) notes.push(`원본 이미지 ${extracted.mediaCount}개`);
  if (extracted.attachments?.length) notes.push(`첨부 ${extracted.attachments.length}개`);
  fileMeta.textContent = notes.join(" · ");
}

async function readFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!window.JSZip && ["docx", "pptx"].includes(extension)) {
    throw new Error("Office 파일 변환 라이브러리를 불러오지 못했습니다.");
  }

  if (extension === "docx") return readDocx(file);
  if (extension === "pptx") return readPptx(file);
  if (extension === "eml") return readEml(await file.text());
  if (extension === "html" || extension === "htm") return readHtml(await file.text(), "html");
  return readPlainText(await file.text(), "txt");
}

async function readDocx(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await readZipText(zip, "word/document.xml");
  const parser = new DOMParser();
  const xml = parser.parseFromString(documentXml, "application/xml");
  const paragraphs = [...xml.getElementsByTagNameNS(NS.w, "p")];
  const blocks = paragraphs
    .map((paragraph) => getDocxParagraphText(paragraph))
    .map(cleanText)
    .filter(Boolean)
    .map((text) => ({ type: "paragraph", text }));
  const mediaCount = zip.file(/^word\/media\//).length;
  return { format: "docx", blocks, mediaCount, attachments: [] };
}

function getDocxParagraphText(paragraph) {
  return [...paragraph.getElementsByTagNameNS(NS.w, "t")]
    .map((node) => node.textContent || "")
    .join("")
    .trim();
}

async function readPptx(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = zip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    .sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
  const parser = new DOMParser();
  const blocks = [];

  for (const slideFile of slideFiles) {
    const xml = parser.parseFromString(await slideFile.async("text"), "application/xml");
    const shapes = [...xml.getElementsByTagNameNS(NS.p, "sp")];
    shapes.forEach((shape) => {
      const paragraphs = [...shape.getElementsByTagNameNS(NS.a, "p")];
      paragraphs.forEach((paragraph) => {
        const text = [...paragraph.getElementsByTagNameNS(NS.a, "t")]
          .map((node) => node.textContent || "")
          .join("")
          .trim();
        const cleaned = cleanText(text);
        if (cleaned) blocks.push({ type: "paragraph", text: cleaned });
      });
    });
  }

  return {
    format: "pptx",
    blocks: removeConsecutiveDuplicates(blocks),
    mediaCount: zip.file(/^ppt\/media\//).length,
    attachments: [],
  };
}

function slideNumber(path) {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] || 0);
}

function readEml(text) {
  const htmlPart = extractMimePart(text, "text/html");
  const plainPart = extractMimePart(text, "text/plain");
  const raw = plainPart
    ? decodeMimeBody(plainPart.body, plainPart.encoding)
    : htmlToText(decodeMimeBody(htmlPart?.body || text, htmlPart?.encoding || ""));
  const blocks = splitEmailParagraphs(raw)
    .map(cleanText)
    .filter(Boolean)
    .map((line) => ({ type: "paragraph", text: line }));
  const attachments = [...text.matchAll(/filename="?([^"\r\n;]+)"?/gi)].map((match) => match[1]);
  return { format: "eml", blocks, mediaCount: attachments.length, attachments };
}

function readHtml(text, format) {
  const blocks = htmlToText(text)
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
    .map((line) => ({ type: "paragraph", text: line }));
  return { format, blocks, mediaCount: (text.match(/<img\b/gi) || []).length, attachments: [] };
}

function readPlainText(text, format) {
  return {
    format,
    blocks: splitLines(text).map(cleanText).filter(Boolean).map((line) => ({ type: "paragraph", text: line })),
    mediaCount: 0,
    attachments: [],
  };
}

async function readZipText(zip, path, optional = false) {
  const file = zip.file(path);
  if (!file) {
    if (optional) return "";
    throw new Error(`${path} 파일을 찾지 못했습니다.`);
  }
  return file.async("text");
}

function extractMimePart(text, contentType) {
  const pattern = new RegExp(`Content-Type:\\s*${contentType}[^\\n]*\\n([\\s\\S]*?)(?=\\n--|$)`, "i");
  const match = text.match(pattern);
  if (!match) return null;
  const section = match[1];
  const encoding = section.match(/Content-Transfer-Encoding:\s*([^\n\r]+)/i)?.[1]?.trim().toLowerCase() || "";
  const body = section
    .replace(/Content-Transfer-Encoding:[^\n]*\n/gi, "")
    .replace(/Content-[^\n]*\n/gi, "")
    .trim();
  return { body, encoding };
}

function decodeMimeBody(value, encoding) {
  if (encoding === "base64") return decodeBase64Utf8(value);
  if (encoding === "quoted-printable") return decodeQuotedPrintableUtf8(value);
  return value || "";
}

function decodeBase64Utf8(value) {
  const binary = atob((value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeQuotedPrintableUtf8(value) {
  const bytes = [];
  const normalized = (value || "").replace(/=\r?\n/g, "");
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === "=" && /[0-9A-F]{2}/i.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(normalized.charCodeAt(index));
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function htmlToText(html) {
  const template = document.createElement("template");
  template.innerHTML = html || "";
  template.content.querySelectorAll("script, style, meta, link").forEach((node) => node.remove());
  template.content.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  template.content.querySelectorAll("p, div, li, h1, h2, h3").forEach((node) => {
    node.appendChild(document.createTextNode("\n"));
  });
  return template.content.textContent || "";
}

function splitLines(text) {
  return (text || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim());
}

function splitEmailParagraphs(text) {
  const normalized = (text || "")
    .replace(/\r/g, "")
    .replace(/\[cid:[^\]]+\]/gi, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const paragraphs = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const result = [];

  paragraphs.forEach((block) => {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((line) => /^-/.test(line))) {
      result.push(...lines);
      return;
    }
    if (lines.length > 1 && lines.some((line) => /^-/.test(line))) {
      lines.forEach((line) => result.push(line));
      return;
    }
    result.push(lines.join(" "));
  });

  return result;
}

function buildAdminHtml(extracted) {
  const mode = resolveMode(extracted);
  const imageUrls = imageUrlsInput.value.split(/\n+/).map((url) => url.trim()).filter(Boolean);
  const videoUrl = videoUrlInput.value.trim();
  const prepared = prepareBlocks(extracted.blocks.map((block) => block.text), mode);
  const title = titleInput.value.trim() || prepared.title || "뉴스룸";
  const source = sourceInput.value.trim() || prepared.source;
  const html = [];
  let imageIndex = 0;

  html.push(`<p class="tit_mid center bold">\n${escapeHtml(title)}\n</p>`);
  html.push(blank());

  if (prepared.leads.length) {
    prepared.leads.forEach((lead) => {
      html.push(`<p class="bold">\n${escapeHtml(lead)}\n</p>`);
    });
    html.push(blank());
  }

  if (imageUrls[imageIndex]) {
    html.push(imageBlock(imageUrls[imageIndex], imageWidthForMode(mode)));
    imageIndex += 1;
    if (prepared.captions[0]) html.push(captionBlock(prepared.captions.shift()));
    html.push(blank());
  }

  prepared.body.forEach((text) => {
    if (isCaption(text)) {
      if (imageUrls[imageIndex]) {
        html.push(imageBlock(imageUrls[imageIndex], "70%"));
        imageIndex += 1;
      }
      html.push(captionBlock(text));
      html.push(blank());
      return;
    }

    if (isHeading(text, mode)) {
      html.push(`<p>\n<span style="font-weight:bold; color:#26247b;">${applyProductRules(escapeHtml(text))}</span>\n</p>`);
      return;
    }

    if (isIndentLine(text)) {
      html.push(indentBlock(text));
      return;
    }

    html.push(`<p>\n${applyProductRules(escapeHtml(text))}\n</p>`);
    html.push(blank());
  });

  if (videoUrl) {
    html.push(videoBlock(videoUrl));
    html.push(blank());
  }

  if (source) {
    html.push(`<p>${escapeHtml(source)}</p>`);
    html.push(blank());
  }

  return html.join("\n").replace(/\n{4,}/g, "\n\n").trim();
}

function resolveMode(extracted) {
  if (templateMode.value !== "auto") return templateMode.value;
  if (extracted.format === "pptx") return "ppt";
  if (extracted.format === "eml") return "story";
  return "press";
}

function prepareBlocks(lines, mode) {
  const cleaned = removeNoise(lines, mode);
  let title = "";
  const leads = [];
  const captions = [];
  const body = [];
  let source = "";

  cleaned.forEach((line) => {
    if (!title && /^제목\s*[:：]/.test(line)) {
      title = cleanText(line.replace(/^제목\s*[:：]\s*/, ""));
      return;
    }
    if (/^본문\s*[:：]?\s*$/i.test(line)) return;
    if (!title && !line.startsWith("-") && !isCaption(line) && !isDisposableLabel(line)) {
      title = line;
      return;
    }
    if (line === title) return;
    if (/^-/.test(line)) {
      leads.push(line);
      return;
    }
    if (isCaption(line)) {
      captions.push(line);
      return;
    }
    if (/^(Source|출처)\s*[:：]/i.test(line)) {
      source = line;
      return;
    }
    if (!isDisposableLabel(line)) body.push(line);
  });

  return { title, leads, captions, body, source };
}

function removeNoise(lines, mode) {
  if (mode === "story") return removeEmailNoise(lines);

  const result = [];

  lines.forEach((rawLine) => {
    let line = cleanText(rawLine);
    if (!line) return;

    if (/뉴스룸.*업로드 요청/.test(line)) return;
    if (/^(뉴스룸|Stories \(EN\)|이미지\s*\d+|영상\s*\d+|\[Snack attitudes\])$/i.test(line)) return;
    if (/^제목\s*[:：]\s*$/.test(line)) return;
    result.push(line);
  });

  return result;
}

function removeEmailNoise(lines) {
  const cleaned = lines.map(cleanText).filter(Boolean);
  const titleIndex = cleaned.findIndex((line) => /^제목\s*[:：]/.test(line));
  const start = titleIndex >= 0 ? titleIndex : 0;
  const result = [];
  let seenTitle = 0;

  for (let index = start; index < cleaned.length; index += 1) {
    const line = cleaned[index];
    if (/^제목\s*[:：]/.test(line)) {
      seenTitle += 1;
      if (seenTitle > 1) break;
    }
    if (/^(감사합니다|.+올림|이\s*예\s*지|Yeji Lee|매니저|MANAGER|㈜삼양사|Samyang Corp\.|본 메일은|This e-mail is intended)/i.test(line)) break;
    if (/뉴스룸.*업로드 요청/.test(line)) continue;
    if (/^(안녕하세요|삼양사|Specialty|마케팅팀)/.test(line)) continue;
    result.push(line);
  }

  return result;
}

function cleanText(value) {
  return (value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[★_]/g, "")
    .replace(/\s+/g, " ")
    .replace(/Allu\s*lose/gi, "Allulose")
    .replace(/form\s*ulation/gi, "formulation")
    .replace(/re\s*cipes/gi, "recipes")
    .replace(/Sanck/gi, "Snack")
    .replace(/Suagr/gi, "Sugar")
    .trim();
}

function removeConsecutiveDuplicates(blocks) {
  const result = [];
  blocks.forEach((block) => {
    if (result[result.length - 1]?.text !== block.text) result.push(block);
  });
  return result;
}

function isDisposableLabel(line) {
  return /^(뉴스룸|이미지\s*\d+|영상\s*\d+|\[.*\])$/i.test(line);
}

function isCaption(line) {
  return /^(■사진자료|▲Image|Pic\s*\d+|Image\s*\d+)/i.test(line);
}

function isHeading(line, mode) {
  if (mode === "press") return false;
  if (line.length > 95) return false;
  if (/[.!?。]$/.test(line)) return false;
  return /Solution|Market|Example|Introducing|Reduction|Fiber|Prototypes|Snacking|challenging|솔루션|소개|예시|시장|제품/i.test(line);
}

function isIndentLine(line) {
  return /^(✓|Smart:|Simple:|Successful:)/i.test(line);
}

function indentBlock(line) {
  const match = line.match(/^(✓?\s*(Smart|Simple|Successful)\s*:\s*)(.*)$/i);
  if (!match) return `<p class="indent" style="font-align:left;">${applyProductRules(escapeHtml(line))}</p>`;
  return `<p class="indent" style="font-align:left;"><span style="font-weight:bold;">${escapeHtml(match[1])}</span>${applyProductRules(escapeHtml(match[3]))}</p>`;
}

function imageBlock(src, width) {
  return `<p style="text-align: center; "><img src="${escapeAttribute(src)}" style="width: ${width};"><br></p>`;
}

function imageWidthForMode(mode) {
  if (mode === "ppt") return "50%";
  if (mode === "story") return "60%";
  return "70%";
}

function captionBlock(text) {
  return `<p class="center img_below_txt" style="text-align: center; ">\n${applyProductRules(escapeHtml(text))}\n</p>`;
}

function videoBlock(url) {
  return `<p class="iframe_wrap" style="text-align: center"><iframe frameborder="0" src="${escapeAttribute(toEmbedUrl(url))}" width="auto" height="auto" class="note-video-clip"></iframe><br></p>`;
}

function toEmbedUrl(url) {
  if (/youtube\.com\/embed\//.test(url)) return url.replace(/^https?:/, "");
  const watch = url.match(/[?&]v=([^&]+)/);
  if (watch) return `//www.youtube.com/embed/${watch[1]}`;
  const short = url.match(/youtu\.be\/([^?]+)/);
  if (short) return `//www.youtube.com/embed/${short[1]}`;
  return url;
}

function blank() {
  return "<p><br></p>";
}

function applyProductRules(html) {
  let output = html;
  PRODUCT_RULES.forEach((rule) => {
    output = output.replace(rule.pattern, rule.html);
  });
  return output;
}

function buildPreviewDocument(bodyHtml) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Newsroom Preview</title>
  <style>
    body { margin: 0; padding: 40px; font-family: Arial, "Noto Sans KR", sans-serif; color: #202124; line-height: 1.75; }
    main { max-width: 860px; margin: 0 auto; }
    p { margin: 0 0 16px; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <main>
${indentHtml(bodyHtml, 4)}
  </main>
</body>
</html>`;
}

function indentHtml(html, spaces) {
  const padding = " ".repeat(spaces);
  return html.split("\n").map((line) => `${padding}${line}`).join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
