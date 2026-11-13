/**
 * SnapPhrase v1.7.0 — Dynamic Date, Time & Variable Placeholder Engine
 */

const GERMAN_WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const GERMAN_WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const GERMAN_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const GERMAN_MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const ENGLISH_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ENGLISH_WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ENGLISH_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateTimeCustom(d, fmt) {
  const YYYY = String(d.getFullYear());
  const YY = YYYY.slice(-2);
  const M = d.getMonth() + 1;
  const MM = pad2(M);
  const D = d.getDate();
  const DD = pad2(D);
  const H = d.getHours();
  const HH = pad2(H);
  const h = H % 12 || 12;
  const hh = pad2(h);
  const m = d.getMinutes();
  const mm = pad2(m);
  const s = d.getSeconds();
  const ss = pad2(s);
  const ampmUpper = H >= 12 ? 'PM' : 'AM';
  const ampmLower = H >= 12 ? 'pm' : 'am';

  const tokenMap = {
    YYYY,
    yyyy: YYYY,
    YY,
    yy: YY,
    MM,
    DD,
    dd: DD,
    HH,
    hh,
    mm,
    ss,
    A: ampmUpper,
    a: ampmLower,
  };

  return String(fmt || '').replace(
    /YYYY|yyyy|YY|yy|MM|DD|dd|HH|hh|mm|ss|\bA\b|\ba\b/g,
    (tok) => tokenMap[tok]
  );
}

function applyDateOffsets(baseDate, offsetTokens) {
  const d = new Date(baseDate.getTime());
  if (!Array.isArray(offsetTokens)) return d;

  for (const tok of offsetTokens) {
    const match = String(tok || '').trim().match(/^([+-]\d+)([dwmy]?)$/i);
    if (!match) continue;
    const amount = parseInt(match[1], 10);
    if (Number.isNaN(amount)) continue;
    const unit = (match[2] || 'd').toLowerCase();

    if (unit === 'd') {
      d.setDate(d.getDate() + amount);
    } else if (unit === 'w') {
      d.setDate(d.getDate() + amount * 7);
    } else if (unit === 'm') {
      d.setMonth(d.getMonth() + amount);
    } else if (unit === 'y') {
      d.setFullYear(d.getFullYear() + amount);
    }
  }
  return d;
}

function formatDateByPreset(d, preset, tagKeyword = 'datum', effectiveLanguage = 'de') {
  const YYYY = String(d.getFullYear());
  const MM = pad2(d.getMonth() + 1);
  const DD = pad2(d.getDate());
  const lower = String(preset || '').trim().toLowerCase();

  if (lower === 'iso') {
    return `${YYYY}-${MM}-${DD}`;
  }
  if (lower === 'us') {
    return `${MM}/${DD}/${YYYY}`;
  }
  if (lower === 'uk' || lower === 'gb') {
    return `${DD}/${MM}/${YYYY}`;
  }
  if (lower === 'long') {
    const useDe = String(tagKeyword || '').toLowerCase() === 'datum' || effectiveLanguage !== 'en';
    if (useDe) {
      return `${d.getDate()}. ${GERMAN_MONTHS[d.getMonth()]} ${YYYY}`;
    }
    return `${ENGLISH_MONTHS[d.getMonth()]} ${d.getDate()}, ${YYYY}`;
  }
  if (lower === '' || lower === 'de' || lower === 'eu') {
    return `${DD}.${MM}.${YYYY}`;
  }

  return formatDateTimeCustom(d, preset);
}

function resolveTemplates(text, sourceClipboardText = null, options = {}) {
  let resolved = text || '';
  const now = options.now instanceof Date ? options.now : new Date();
  const effectiveLanguage = options.effectiveLanguage === 'en' ? 'en' : 'de';
  const readClipboardText = typeof options.readClipboardText === 'function' ? options.readClipboardText : null;

  const defaultDate = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${now.getFullYear()}`;
  const defaultTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  resolved = resolved.replace(/\{(datum|date):([^}]+)\}/gi, (match, keyword, inner) => {
    const parts = String(inner || '')
      .split(':')
      .map((s) => s.trim())
      .filter(Boolean);

    const offsets = [];
    const formatParts = [];
    for (const part of parts) {
      if (/^[+-]\d+[dwmy]?$/i.test(part)) {
        offsets.push(part);
      } else {
        formatParts.push(part);
      }
    }

    const targetDate = applyDateOffsets(now, offsets);
    const fmtSpec = formatParts.join(':');
    const fmtLower = fmtSpec.toLowerCase();

    if (['', 'iso', 'us', 'uk', 'gb', 'de', 'eu', 'long'].includes(fmtLower)) {
      return formatDateByPreset(targetDate, fmtLower, keyword, effectiveLanguage);
    }
    return formatDateTimeCustom(targetDate, fmtSpec);
  });

  resolved = resolved.replace(/\{wochentag\}/gi, GERMAN_WEEKDAYS[now.getDay()]);
  resolved = resolved.replace(/\{wochentag_kurz\}/gi, GERMAN_WEEKDAYS_SHORT[now.getDay()]);
  resolved = resolved.replace(/\{monat\}/gi, GERMAN_MONTHS[now.getMonth()]);
  resolved = resolved.replace(/\{monat_kurz\}/gi, GERMAN_MONTHS_SHORT[now.getMonth()]);

  resolved = resolved.replace(/\{weekday\}/gi, ENGLISH_WEEKDAYS[now.getDay()]);
  resolved = resolved.replace(/\{weekday_short\}/gi, ENGLISH_WEEKDAYS_SHORT[now.getDay()]);
  resolved = resolved.replace(/\{month\}/gi, ENGLISH_MONTHS[now.getMonth()]);
  resolved = resolved.replace(/\{month_short\}/gi, ENGLISH_MONTHS_SHORT[now.getMonth()]);

  resolved = resolved.replace(/\{(?:datum|date)\}/gi, defaultDate);

  resolved = resolved.replace(/\{(?:zeit|time):([^}]+)\}/gi, (m, fmt) => {
    const fmtTrim = String(fmt || '').trim();
    const fmtLower = fmtTrim.toLowerCase();
    if (fmtLower === '12h' || fmtLower === 'us') {
      const h12 = now.getHours() % 12 || 12;
      const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
      return `${h12}:${pad2(now.getMinutes())} ${ampm}`;
    }
    if (fmtLower === 'sec' || fmtLower === 'iso' || fmtLower === '24h:sec') {
      return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    }
    return formatDateTimeCustom(now, fmtTrim);
  });
  resolved = resolved.replace(/\{(?:zeit|time)\}/gi, defaultTime);

  let clipContent = '';
  if (sourceClipboardText !== null && sourceClipboardText !== undefined) {
    clipContent = String(sourceClipboardText);
  } else if (readClipboardText) {
    try {
      clipContent = String(readClipboardText() || '');
    } catch (e) {
      clipContent = '';
    }
  }

  resolved = resolved.replace(/\{clipboard\}/gi, () => clipContent);
  resolved = resolved.replace(/\{n\}/gi, '\n');

  return resolved;
}

module.exports = {
  formatDateTimeCustom,
  applyDateOffsets,
  formatDateByPreset,
  resolveTemplates,
  GERMAN_WEEKDAYS,
  GERMAN_WEEKDAYS_SHORT,
  GERMAN_MONTHS,
  GERMAN_MONTHS_SHORT,
  ENGLISH_WEEKDAYS,
  ENGLISH_WEEKDAYS_SHORT,
  ENGLISH_MONTHS,
  ENGLISH_MONTHS_SHORT,
};
