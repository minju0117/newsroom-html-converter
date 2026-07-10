const state = {
  file: null,
  convertedHtml: "",
  previewHtml: "",
  convertedFiles: [],
  activeFileIndex: 0,
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
const sectionTabs = document.querySelector("#sectionTabs");

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

    state.convertedFiles = buildDownloadFiles(state.extracted, finalHtml);
    state.activeFileIndex = 0;
    renderSectionTabs();
    setActiveFile(0);
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

downloadButton.addEventListener("click", async () => {
  if (state.convertedFiles.length > 1 && window.JSZip) {
    const zip = new JSZip();
    state.convertedFiles.forEach((file) => zip.file(file.name, file.html));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob("newsroom-upload-html.zip", blob);
    return;
  }

  const [file] = state.convertedFiles;
  downloadText(file?.name || "newsroom-upload.html", file?.html || state.convertedHtml);
});

downloadPreviewButton.addEventListener("click", () => {
  downloadText("newsroom-preview.html", state.previewHtml);
});

function setFile(file) {
  state.file = file;
  state.convertedHtml = "";
  state.previewHtml = "";
  state.convertedFiles = [];
  state.activeFileIndex = 0;
  state.extracted = null;
  htmlOutput.value = "";
  sectionTabs.hidden = true;
  sectionTabs.innerHTML = "";
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

function renderSectionTabs() {
  sectionTabs.innerHTML = "";
  sectionTabs.hidden = state.convertedFiles.length <= 1;

  state.convertedFiles.forEach((file, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = file.label || `Section ${index + 1}`;
    button.classList.toggle("active", index === state.activeFileIndex);
    button.addEventListener("click", () => setActiveFile(index));
    sectionTabs.appendChild(button);
  });
}

function setActiveFile(index) {
  const file = state.convertedFiles[index] || state.convertedFiles[0];
  if (!file) return;

  state.activeFileIndex = index;
  state.convertedHtml = file.html;
  state.previewHtml = buildPreviewDocument(file.html);
  htmlOutput.value = file.html;
  preview.innerHTML = file.html;

  [...sectionTabs.querySelectorAll("button")].forEach((button, buttonIndex) => {
    button.classList.toggle("active", buttonIndex === index);
  });
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
  const plainParts = extractMimeParts(text, "text/plain");
  const htmlText = htmlPart ? decodeMimeBody(htmlPart.body, htmlPart.encoding, htmlPart.charset) : "";
  const htmlSections = htmlText ? parseEmlHtmlSections(htmlText) : [];
  if (htmlSections.length) {
    const blocks = htmlSections.flatMap((section) => flattenEmlSection(section));
    const attachments = [...text.matchAll(/filename="?([^"\r\n;]+)"?/gi)].map((match) => match[1]);
    return { format: "eml", blocks, sections: htmlSections, mediaCount: attachments.length, attachments };
  }

  const plainTexts = plainParts
    .map((part) => decodeMimeBody(part.body, part.encoding, part.charset))
    .map(normalizeEmailText)
    .map(isolatePlainTextBox)
    .filter(Boolean);
  const raw = plainTexts.length
    ? plainTexts.join("\n\n")
    : htmlToText(decodeMimeBody(htmlPart?.body || text, htmlPart?.encoding || ""));
  const sections = parseEmlPlainSections(plainTexts.length ? plainTexts : [raw]);
  const blocks = sections.flatMap((section) => flattenEmlSection(section));
  const attachments = [...text.matchAll(/filename="?([^"\r\n;]+)"?/gi)].map((match) => match[1]);
  return { format: "eml", blocks, sections, mediaCount: attachments.length, attachments };
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
  const charset = normalizeCharset(match[0].match(/charset="?([^";\r\n]+)"?/i)?.[1] || "");
  const encoding = section.match(/Content-Transfer-Encoding:\s*([^\n\r]+)/i)?.[1]?.trim().toLowerCase() || "";
  const body = section
    .replace(/Content-Transfer-Encoding:[^\n]*\n/gi, "")
    .replace(/Content-[^\n]*\n/gi, "")
    .trim();
  return { body, encoding, charset };
}

function extractMimeParts(text, contentType) {
  const pattern = new RegExp(`Content-Type:\\s*${contentType}[^\\n]*\\n([\\s\\S]*?)(?=\\n--|$)`, "gi");
  const parts = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const section = match[1];
    const charset = normalizeCharset(match[0].match(/charset="?([^";\r\n]+)"?/i)?.[1] || "");
    const encoding = section.match(/Content-Transfer-Encoding:\s*([^\n\r]+)/i)?.[1]?.trim().toLowerCase() || "";
    const body = section
      .replace(/Content-Transfer-Encoding:[^\n]*\n/gi, "")
      .replace(/Content-[^\n]*\n/gi, "")
      .trim();
    if (body) parts.push({ body, encoding, charset });
  }

  return parts;
}

function decodeMimeBody(value, encoding, charset = "utf-8") {
  if (encoding === "base64") return decodeBase64Text(value, charset);
  if (encoding === "quoted-printable") return decodeQuotedPrintableText(value, charset);
  return value || "";
}

function decodeBase64Text(value, charset) {
  const binary = atob((value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return decodeBytes(bytes, charset);
}

function decodeQuotedPrintableText(value, charset) {
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
  return decodeBytes(new Uint8Array(bytes), charset);
}

function decodeBytes(bytes, charset) {
  try {
    return new TextDecoder(normalizeCharset(charset)).decode(bytes);
  } catch (error) {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function normalizeCharset(charset) {
  const normalized = String(charset || "utf-8").trim().toLowerCase();
  if (["ks_c_5601-1987", "ks_c_5601", "x-windows-949", "windows-949", "cp949", "euc_kr"].includes(normalized)) {
    return "euc-kr";
  }
  return normalized || "utf-8";
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

function normalizeEmailText(text) {
  return (text || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function parseEmlHtmlSections(html) {
  const cells = extractHtmlTableCells(html);
  const targets = cells.length ? cells : [html];
  return targets
    .map(parseEmlHtmlSection)
    .filter((section) => section && (section.title || section.summaries.length || section.body.length));
}

function extractHtmlTableCells(html) {
  const cells = [];
  const pattern = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let match;

  while ((match = pattern.exec(html || "")) !== null) {
    const text = htmlInlineText(match[1]);
    if (isBodyLabel(text) || new RegExp(`${KR_BODY}\\s*${LABEL_COLON}`).test(text)) {
      cells.push(match[1]);
    }
  }

  return cells;
}

function parseEmlHtmlSection(html) {
  const paragraphs = [...(html || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => ({ html: match[1], text: cleanText(htmlInlineText(match[1])) }))
    .filter((paragraph) => paragraph.text || hasInlineImage(paragraph.html));
  if (!paragraphs.length) return null;

  const bodyIndex = paragraphs.findIndex((paragraph) => isBodyLabel(paragraph.text) || isBodyPrefix(paragraph.text));
  const titleIndex = paragraphs.findIndex((paragraph) => isTitlePrefix(paragraph.text));
  const sourceParagraphs = bodyIndex >= 0
    ? paragraphs.slice(bodyIndex + 1)
    : titleIndex >= 0
      ? paragraphs.slice(titleIndex + 1)
      : paragraphs;
  const title = titleIndex >= 0 ? cleanText(stripTitlePrefix(paragraphs[titleIndex].text)) : "";
  const body = [];

  sourceParagraphs.forEach((paragraph) => {
    if (isTitleLabel(paragraph.text) || isTitlePrefix(paragraph.text) || isBodyLabel(paragraph.text) || isBodyPrefix(paragraph.text)) return;
    if (isHtmlImageNote(paragraph.text) || hasInlineImage(paragraph.html)) {
      body.push({ type: "image", text: KR_IMAGE });
      return;
    }
    if (isFootnoteBlock([paragraph.text])) {
      body.push({ type: "footnote", text: paragraph.text });
      return;
    }

    const htmlText = convertWordInlineHtml(paragraph.html);
    if (!htmlText) return;
    if (isHtmlBullet(paragraph.text)) {
      body.push({ type: "richIndent", html: htmlText });
      return;
    }
    if (isHtmlHeading(paragraph.html, paragraph.text)) {
      body.push({ type: hasColor(paragraph.html, "#26247B") ? "richHeading" : "richBold", html: htmlText });
      return;
    }
    body.push({ type: "richParagraph", html: htmlText });
  });

  return { title, summaries: [], body: mergeCaptionAfterImage(body) };
}

function htmlInlineText(html) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<o:p>\s*&nbsp;\s*<\/o:p>/gi, " ")
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim());
}

function convertWordInlineHtml(html) {
  let output = String(html || "")
    .replace(/<o:p>\s*&nbsp;\s*<\/o:p>/gi, "")
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, "")
    .replace(/<br\s*\/?>/gi, "<br>\n");

  output = output.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (match, href, content) => {
    const text = convertWordInlineHtml(content);
    return `<a href="${escapeAttribute(decodeHtmlEntities(href))}" target="_blank"><u><font color="#3984c6">${text}</font></u></a>`;
  });
  output = output.replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, '<span style="font-style:italic;">$1</span>');
  output = output.replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, "$1");
  for (let count = 0; count < 6; count += 1) {
    output = output.replace(/<span\b(?![^>]*(?:color:|font-style:\s*italic))[^>]*>([\s\S]*?)<\/span>/gi, "$1");
  }
  output = output.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (match, attributes, content) => {
    const color = attributes.match(/color:\s*(#[0-9A-Fa-f]{6})/i)?.[1];
    const italic = /font-style:\s*italic/i.test(attributes);
    const styles = [];
    if (italic) styles.push("font-style:italic;");
    if (color) styles.push(`color:${color};`);
    return styles.length ? `<span style="${styles.join(" ")}">${content}</span>` : content;
  });

  return decodeHtmlEntities(output)
    .replace(/<(?!\/?(span|u|font|a|br)\b)[^>]+>/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/\s*(<br>\n)\s*/g, "$1")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'");
}

function isHtmlImageNote(text) {
  return /^\(.+\)$/.test(text || "") && /이미지|썸네일/.test(text || "");
}

function hasInlineImage(html) {
  return /<(img|v:imagedata)\b/i.test(html || "") || /src=["']cid:/i.test(html || "");
}

function isHtmlBullet(text) {
  return /^[•·▪\-]\s*/.test(text || "");
}

function isHtmlHeading(html, text) {
  if ((text || "").length > 120) return false;
  if (isHtmlBullet(text)) return false;
  if (hasColor(html, "#26247B")) return true;
  if (/<a\b/i.test(html || "")) return false;

  const boldText = [...String(html || "").matchAll(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => cleanText(htmlInlineText(match[2])))
    .join(" ");
  return boldText.length > 0 && cleanText(text).startsWith(boldText);
}

function hasColor(html, color) {
  const normalized = String(html || "").toLowerCase();
  return normalized.includes(`color:${color.toLowerCase()}`) || normalized.includes(`color: ${color.toLowerCase()}`);
}

function isolatePlainTextBox(text) {
  const normalized = normalizeEmailText(text);
  const plainMatch = normalized.match(/(?:^|\n)\s*Plain\s*text\s*(?:\n|$)/i);
  if (!plainMatch) return normalized;

  return normalized
    .slice((plainMatch.index || 0) + plainMatch[0].length)
    .replace(/\n\s*(HTML|Rich\s*text|Original\s*message)\s*\n[\s\S]*$/i, "")
    .trim();
}

function parseEmlPlainSections(plainTexts) {
  const sections = [];

  plainTexts.forEach((plainText) => {
    const text = normalizeEmailText(plainText);
    if (!text) return;

    const markers = [...text.matchAll(new RegExp(`(?:^|\\n)\\s*${KR_TITLE}\\s*[:：]\\s*([\\s\\S]*?)\\n\\s*${KR_BODY}\\s*[:：]\\s*`, "g"))];
    if (!markers.length) {
      const section = parseEmlBodySection(stripEmailHeaderBlock(text));
      if (section) sections.push(section);
      return;
    }

    markers.forEach((marker, index) => {
      const start = marker.index + marker[0].length;
      const end = markers[index + 1]?.index ?? text.length;
      const bodyText = text.slice(start, end).trim();
      const section = parseEmlBodySection(bodyText);
      if (section) sections.push(section);
    });
  });

  return sections;
}

function parseEmlBodySection(bodyText) {
  const blocks = stripFooterBlock(stripEmailHeaderBlock(normalizeEmailText(bodyText)))
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!blocks.length) return null;

  const firstLines = splitBlockLines(blocks.shift());
  const title = cleanText(firstLines.shift() || "");
  const contentBlocks = [];
  if (firstLines.length) contentBlocks.push(firstLines.join("\n"));
  contentBlocks.push(...blocks);

  const summaries = [];
  const body = [];
  let summaryOpen = true;

  contentBlocks.forEach((block) => {
    const lines = splitBlockLines(block);
    if (!lines.length) return;

    if (lines.every(isImagePlaceholder)) {
      body.push({ type: "image", text: KR_IMAGE });
      summaryOpen = false;
      return;
    }

    if (lines.length === 1 && isCaption(lines[0])) {
      body.push({ type: "caption", text: lines[0] });
      summaryOpen = false;
      return;
    }

    if (isFootnoteBlock(lines)) {
      body.push({ type: "footnote", text: lines.join("\n") });
      summaryOpen = false;
      return;
    }

    if (summaryOpen && lines.every((line) => /^-\s*/.test(line))) {
      summaries.push(...lines);
      return;
    }

    summaryOpen = false;
    lines.forEach((line, index) => {
      if (isImagePlaceholder(line)) {
        if (index > 0) {
          const before = lines.slice(0, index).join("\n");
          if (before) body.push({ type: "paragraph", text: before });
        }
        body.push({ type: "image", text: KR_IMAGE });
        const after = lines.slice(index + 1).join("\n");
        if (after) body.push({ type: "paragraph", text: after });
      }
    });
    if (!lines.some(isImagePlaceholder)) {
      body.push({ type: isFootnoteBlock(lines) ? "footnote" : "paragraph", text: lines.join("\n") });
    }
  });

  return {
    title,
    summaries,
    body: mergeCaptionAfterImage(body),
  };
}

function splitBlockLines(block) {
  return (block || "")
    .split(/\n/)
    .map((line) => stripBodyPrefix(line))
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => !isBodyLabel(line))
    .filter((line) => !isTitleLabel(line))
    .filter((line) => !isTitlePrefix(line));
}

function isImagePlaceholder(line) {
  return /^\[cid:[^\]]+\]$/i.test(line)
    || /^<image>$/i.test(line)
    || new RegExp(`^${KR_IMAGE}$`, "i").test(line)
    || /\.(png|jpe?g|gif|webp)$/i.test(line);
}

function isFootnoteBlock(lines) {
  if (!lines.length) return false;
  return new RegExp(`^(Reference|References|Source|Sources|${KR_REFERENCE}|${KR_SOURCE})\\s*${LABEL_COLON}`, "i").test(lines[0])
    || lines.every((line) => /^\[\d+\]\s+https?:\/\//i.test(line));
}

const KR_TITLE = "\uC81C\uBAA9";
const KR_BODY = "\uBCF8\uBB38";
const KR_IMAGE = "\uC774\uBBF8\uC9C0";
const KR_THANKS = "\uAC10\uC0AC\uD569\uB2C8\uB2E4";
const KR_FROM = "\uC62C\uB9BC";
const KR_REFERENCE = "\uCC38\uACE0";
const KR_SOURCE = "\uCD9C\uCC98";
const LABEL_COLON = "[:\uFF1A)]";

function stripEmailHeaderBlock(text) {
  return normalizeEmailText(text)
    .replace(new RegExp(`^[\\s\\S]*?\\n\\s*${KR_BODY}\\s*${LABEL_COLON}\\s*`, "i"), "")
    .replace(new RegExp(`^[\\s\\S]*?\\n\\s*${KR_TITLE}\\s*${LABEL_COLON}\\s*`, "i"), `${KR_TITLE}: `)
    .split(/\n/)
    .map((line) => stripBodyPrefix(line))
    .filter((line) => !isBodyLabel(line) && !isTitleLabel(line) && !isTitlePrefix(line))
    .join("\n")
    .trim();
}

function stripFooterBlock(text) {
  const normalized = normalizeEmailText(text);
  const footerPatterns = [
    new RegExp(`\\n\\s*${KR_THANKS}[\\s\\S]*$`, "i"),
    new RegExp(`\\n\\s*.*${KR_FROM}\\s*$[\\s\\S]*`, "i"),
    /\n\s*Yeji\s+Lee[\s\S]*$/i,
    /\n\s*This e-mail[\s\S]*$/i,
    /\n\s*CONFIDENTIAL[\s\S]*$/i,
  ];

  return footerPatterns.reduce((result, pattern) => result.replace(pattern, ""), normalized).trim();
}

function isBodyLabel(line) {
  return new RegExp(`^\\s*${KR_BODY}\\s*${LABEL_COLON}?\\s*$`, "i").test(line || "");
}

function isTitleLabel(line) {
  return new RegExp(`^\\s*${KR_TITLE}\\s*${LABEL_COLON}?\\s*$`, "i").test(line || "");
}

function isTitlePrefix(line) {
  return new RegExp(`^\\s*${KR_TITLE}\\s*${LABEL_COLON}`, "i").test(line || "");
}

function stripTitlePrefix(line) {
  return String(line || "").replace(new RegExp(`^\\s*${KR_TITLE}\\s*${LABEL_COLON}\\s*`, "i"), "");
}

function isBodyPrefix(line) {
  return new RegExp(`^\\s*${KR_BODY}\\s*${LABEL_COLON}`, "i").test(line || "");
}

function stripBodyPrefix(line) {
  return String(line || "").replace(new RegExp(`^\\s*${KR_BODY}\\s*${LABEL_COLON}\\s*`, "i"), "");
}

function mergeCaptionAfterImage(items) {
  return items.map((item, index) => {
    if (item.type === "paragraph" && index > 0 && items[index - 1].type === "image" && isCaption(item.text)) {
      return { ...item, type: "caption" };
    }
    return item;
  });
}

function flattenEmlSection(section) {
  return [
    { type: "title", text: section.title },
    ...section.summaries.map((text) => ({ type: "summary", text })),
    ...section.body,
  ].filter((block) => block.text);
}

function buildAdminHtml(extracted) {
  if (extracted.format === "eml" && extracted.sections?.length) {
    return buildEmlAdminHtml([extracted.sections[0]]);
  }

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

function buildEmlAdminHtml(sections) {
  const imageState = { urls: currentImageUrls(), index: 0 };
  return sections
    .map((section, index) => {
      const html = buildEmlSectionHtml(section, imageState);
      if (sections.length <= 1) return html;
      return `<!-- EML section ${index + 1} -->\n${html}`;
    })
    .join("\n\n")
    .trim();
}

function buildEmlSectionHtml(section, imageState = { urls: currentImageUrls(), index: 0 }) {
  const html = [];
  const title = cleanText(section.title);

  if (title) {
    html.push(`<p class="tit_mid center bold">\n${escapeHtml(title)}\n</p>`);
    html.push(blank());
  }

  if (section.summaries.length) {
    section.summaries.forEach((summary) => {
      html.push(`<p class="bold">\n${applyInlineFootnotes(escapeHtml(summary))}\n</p>`);
    });
    html.push(blank());
  }

  section.body.forEach((block, index) => {
    if (block.type === "image") {
      html.push(emlImageBlock(imageState));
      return;
    }

    if (block.type === "caption") {
      html.push(captionBlock(block.text));
      if (section.body[index + 1]) html.push(blank());
      return;
    }

    if (block.type === "footnote") {
      html.push(footnoteBlock(block.text));
      if (section.body[index + 1]) html.push(blank());
      return;
    }

    if (block.type === "richHeading") {
      html.push(`<p style="font-weight:bold; color:#26247B;">\n${block.html}\n</p>`);
      return;
    }

    if (block.type === "richBold") {
      html.push(`<p style="font-weight:bold;">\n${block.html}\n</p>`);
      return;
    }

    if (block.type === "richIndent") {
      html.push(`<p class="indent" style="font-align:left;">\n\t${block.html}\n</p>`);
      return;
    }

    if (block.type === "richParagraph") {
      html.push(`<p>\n${applyInlineFootnotes(block.html)}\n</p>`);
      if (section.body[index + 1]) html.push(blank());
      return;
    }

    html.push(`<p>\n${formatParagraphText(block.text)}\n</p>`);
    if (section.body[index + 1]) html.push(blank());
  });

  return html.join("\n").replace(/\n{4,}/g, "\n\n").trim();
}

function formatParagraphText(text) {
  return (text || "")
    .split(/\n/)
    .map((line) => applyInlineFootnotes(escapeHtml(cleanText(line))))
    .filter(Boolean)
    .join("<br>\n");
}

function currentImageUrls() {
  return imageUrlsInput.value.split(/\n+/).map((url) => url.trim()).filter(Boolean);
}

function emlImageBlock(imageState) {
  const url = imageState.urls[imageState.index];
  imageState.index += 1;
  return url ? imageBlock(url, imageState.index === 1 ? "70%" : "100%") : `<p>${KR_IMAGE}</p>`;
}

function applyInlineFootnotes(html) {
  return html.replace(/\[(\d+)\]/g, '<span style="font-size: 12px;vertical-align: super;">[$1]</span>');
}

function footnoteBlock(text) {
  const lines = (text || "")
    .split(/\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map(formatFootnoteLine);

  return `<p>\n<span style="font-size: 12px; font-style:italic;">\n${lines.join("<br>\n")}\n</span>\n</p>`;
}

function formatFootnoteLine(line) {
  return escapeHtml(line)
    .replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${escapeAttribute(url)}" target="_blank"><u><font color="#0000ff">${escapeHtml(url)}</font></u></a>`);
}

function buildDownloadFiles(extracted, finalHtml) {
  if (extracted.format !== "eml" || !extracted.sections?.length) {
    return [{ name: "newsroom-upload.html", label: "HTML", html: finalHtml }];
  }

  if (extracted.sections.length === 1) {
    return [{ name: "newsroom-upload.html", label: sectionLabel(extracted.sections[0], 0), html: buildEmlAdminHtml(extracted.sections) }];
  }

  const usedNames = new Set();
  return extracted.sections.map((section, index) => {
    const suffix = uniqueSuffix(guessSectionLanguage(section), index, usedNames);
    return {
      name: `newsroom-upload-${suffix}.html`,
      label: sectionLabel(section, index),
      html: buildEmlAdminHtml([section]),
    };
  });
}

function uniqueSuffix(base, index, usedNames) {
  let suffix = base || `section-${index + 1}`;
  if (!usedNames.has(suffix)) {
    usedNames.add(suffix);
    return suffix;
  }

  suffix = `${base}-${index + 1}`;
  usedNames.add(suffix);
  return suffix;
}

function guessSectionLanguage(section) {
  const title = section.title || "";
  if (/[\uAC00-\uD7A3]/.test(title)) return "ko";
  if (/[A-Za-z]/.test(title)) return "en";

  const text = [
    ...section.summaries,
    ...section.body.filter((block) => block.type !== "image").map((block) => block.text),
  ].join(" ");
  if (/[\uAC00-\uD7A3]/.test(text)) return "ko";
  if (/[A-Za-z]/.test(text)) return "en";
  return "section";
}

function sectionLabel(section, index) {
  const language = guessSectionLanguage(section);
  if (language === "ko") return "국문";
  if (language === "en") return "영문";
  return `섹션 ${index + 1}`;
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
    .replace(/\b(Nexweet|Fiberest|Fibernova)�/g, "$1®")
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
  return /^(\[[^\]]*사진[^\]]*\]|[■▲※◆◇□●○▶▷▪*]+\s*|사진\s*[.:]|Photo\s*[.:]|Image\s*[.:]|Pic\s*\d+)/i.test(line);
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
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
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
