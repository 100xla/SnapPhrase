/**
 * SnapPhrase v1.7.0 — Markdown & Rich-Text Clipboard Formatter
 */

const CURSOR_SENTINEL = '\uE000SNAPCURSOR\uE000';
const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:)/i;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSimpleInline(rawText) {
  const tokens = [];
  let work = String(rawText || '');

  // 1. Protect inline code spans (`...`) before any emphasis rules or escaping
  work = work.replace(/`([^`\n]+)`/g, (_m, codeContent) => {
    const idx = tokens.length;
    tokens.push({
      plain: codeContent,
      html: `<code style="font-family:Consolas,monospace;background:rgba(128,128,128,0.14);padding:1px 4px;border-radius:3px;">${escapeHtml(codeContent)}</code>`,
    });
    return `\uE001T${idx}\uE002`;
  });

  // 2. Apply emphasis & strikethrough markers using safe PUA delimiters (no '<' or '>' so escapeHtml leaves them intact)
  work = work.replace(/\*\*([^\s*\n](?:[^*\n]*?[^\s*\n])?)\*\*/g, '\uE003strong\uE004$1\uE003/strong\uE004');
  work = work.replace(/__([^\s_\n](?:[^_\n]*?[^\s_\n])?)__/g, '\uE003strong\uE004$1\uE003/strong\uE004');
  work = work.replace(/~~([^\s~\n](?:[^~\n]*?[^\s~\n])?)~~/g, '\uE003s\uE004$1\uE003/s\uE004');
  work = work.replace(/(^|[^*])\*([^\s*\n](?:[^*\n]*?[^\s*\n])?)\*(?!\*)/g, '$1\uE003em\uE004$2\uE003/em\uE004');
  work = work.replace(
    /(^|[\s([{"'])_([^\s_\n](?:[^_\n]*?[^\s_\n])?)_(?=$|[\s)\]}"'.,!?:;])/g,
    '$1\uE003em\uE004$2\uE003/em\uE004'
  );

  const plain = work
    .replace(/\uE003\/?(?:strong|em|s)\uE004/g, '')
    .replace(/\uE001T(\d+)\uE002/g, (_m, i) => tokens[Number(i)].plain);

  const html = escapeHtml(work)
    .replace(/\uE003(\/?(?:strong|em|s))\uE004/g, '<$1>')
    .replace(/\uE001T(\d+)\uE002/g, (_m, i) => tokens[Number(i)].html);

  return { plain, html };
}

function formatInlineMarkdown(rawLine) {
  const linkTokens = [];
  let work = String(rawLine || '');

  // Protect inline code spans first so `[a](url)` inside backticks stays literal code
  const codeTokens = [];
  work = work.replace(/`([^`\n]+)`/g, (_m, codeContent) => {
    const idx = codeTokens.length;
    codeTokens.push(codeContent);
    return `\uE005C${idx}\uE006`;
  });

  // Extract valid [label](url) links before formatting text so URLs containing underscores aren't corrupted
  work = work.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (fullMatch, label, rawUrl) => {
    const url = String(rawUrl || '').trim();
    if (!SAFE_URL_RE.test(url)) {
      return fullMatch;
    }
    const restoredLabel = label.replace(/\uE005C(\d+)\uE006/g, (_cm, ci) => '`' + codeTokens[Number(ci)] + '`');
    const formattedLabel = formatSimpleInline(restoredLabel);
    const idx = linkTokens.length;
    linkTokens.push({
      plain: formattedLabel.plain,
      html: `<a href="${escapeHtml(url)}">${formattedLabel.html}</a>`,
    });
    return `\uE007L${idx}\uE008`;
  });

  // Restore inline code spans so formatSimpleInline handles them together with surrounding text
  work = work.replace(/\uE005C(\d+)\uE006/g, (_m, ci) => '`' + codeTokens[Number(ci)] + '`');

  const simple = formatSimpleInline(work);
  const plain = simple.plain.replace(/\uE007L(\d+)\uE008/g, (_m, i) => linkTokens[Number(i)].plain);
  const html = simple.html.replace(/\uE007L(\d+)\uE008/g, (_m, i) => linkTokens[Number(i)].html);

  return { plain, html };
}

function markdownToClipboardFormats(rawText) {
  const normalized = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const blocks = [];
  let paraBuffer = null;
  let listBuffer = null;

  const flushPara = () => {
    if (paraBuffer && paraBuffer.length > 0) {
      blocks.push({ type: 'paragraph', lines: paraBuffer });
    }
    paraBuffer = null;
  };

  const flushList = () => {
    if (listBuffer && listBuffer.items.length > 0) {
      blocks.push(listBuffer);
    }
    listBuffer = null;
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushPara();
      flushList();
      blocks.push({ type: 'blank' });
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushPara();
      flushList();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: formatInlineMarkdown(headingMatch[2]),
      });
      continue;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      flushPara();
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { type: 'list', ordered: false, items: [] };
      }
      listBuffer.items.push({ content: formatInlineMarkdown(ulMatch[1]) });
      continue;
    }

    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushPara();
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { type: 'list', ordered: true, start: parseInt(olMatch[1], 10) || 1, items: [] };
      }
      listBuffer.items.push({ num: olMatch[1], content: formatInlineMarkdown(olMatch[2]) });
      continue;
    }

    flushList();
    if (!paraBuffer) paraBuffer = [];
    paraBuffer.push(formatInlineMarkdown(line));
  }

  flushPara();
  flushList();

  // Build plain text representation preserving line breaks
  const plainChunks = [];
  for (const block of blocks) {
    if (block.type === 'blank') {
      plainChunks.push('');
    } else if (block.type === 'heading') {
      plainChunks.push(block.content.plain);
    } else if (block.type === 'paragraph') {
      plainChunks.push(block.lines.map((l) => l.plain).join('\n'));
    } else if (block.type === 'list') {
      plainChunks.push(
        block.items
          .map((item) => (block.ordered ? `${item.num}. ${item.content.plain}` : `• ${item.content.plain}`))
          .join('\n')
      );
    }
  }
  const plainText = plainChunks.join('\n');

  // Filter content blocks for semantic HTML (avoid extra trailing margins)
  const contentBlocks = blocks.filter((b) => b.type !== 'blank');
  if (contentBlocks.length === 0) {
    return { text: plainText, html: '' };
  }

  if (contentBlocks.length === 1 && contentBlocks[0].type === 'paragraph') {
    const inlineHtml = contentBlocks[0].lines.map((l) => l.html).join('<br>');
    return { text: plainText, html: inlineHtml };
  }

  const htmlParts = contentBlocks.map((block, idx) => {
    const isLast = idx === contentBlocks.length - 1;
    const marginBottom = isLast ? '0' : '8px';

    if (block.type === 'heading') {
      return `<h${block.level} style="margin:0 0 ${marginBottom} 0;">${block.content.html}</h${block.level}>`;
    }
    if (block.type === 'paragraph') {
      return `<p style="margin:0 0 ${marginBottom} 0;">${block.lines.map((l) => l.html).join('<br>')}</p>`;
    }
    const tag = block.ordered ? 'ol' : 'ul';
    const startAttr = block.ordered && block.start > 1 ? ` start="${block.start}"` : '';
    const liHtml = block.items.map((item) => `<li>${item.content.html}</li>`).join('');
    return `<${tag}${startAttr} style="margin:0 0 ${marginBottom} 0;padding-left:20px;">${liHtml}</${tag}>`;
  });

  return { text: plainText, html: htmlParts.join('') };
}

function preparePastePayloads(resolvedText, { richText = false } = {}) {
  const input = String(resolvedText || '');
  const cursorMatch = input.match(/\{cursor\}/i);

  if (!richText) {
    if (!cursorMatch || cursorMatch.index === undefined) {
      return { text: input, html: null, cursorOffset: 0 };
    }
    const idx = cursorMatch.index;
    const before = input.slice(0, idx);
    const after = input.slice(idx + cursorMatch[0].length);
    return {
      text: before + after,
      html: null,
      cursorOffset: Array.from(after.replace(/\r/g, '')).length,
    };
  }

  let withSentinel = input;
  const hasCursor = Boolean(cursorMatch && cursorMatch.index !== undefined);
  if (hasCursor) {
    const idx = cursorMatch.index;
    withSentinel = input.slice(0, idx) + CURSOR_SENTINEL + input.slice(idx + cursorMatch[0].length);
  }

  const formatted = markdownToClipboardFormats(withSentinel);
  let cursorOffset = 0;
  let finalText = formatted.text;
  let finalHtml = formatted.html;

  if (hasCursor) {
    const sIdx = finalText.indexOf(CURSOR_SENTINEL);
    if (sIdx !== -1) {
      const after = finalText.slice(sIdx + CURSOR_SENTINEL.length);
      cursorOffset = Array.from(after.replace(/\r/g, '')).length;
    }
    finalText = finalText.split(CURSOR_SENTINEL).join('');
    finalHtml = finalHtml.split(CURSOR_SENTINEL).join('');
  }

  return {
    text: finalText,
    html: finalHtml,
    cursorOffset,
  };
}

module.exports = {
  CURSOR_SENTINEL,
  escapeHtml,
  markdownToClipboardFormats,
  preparePastePayloads,
};
