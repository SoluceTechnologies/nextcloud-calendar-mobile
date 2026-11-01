export interface TextPart {
    text: string;
    url?: string;
}

const TLDS = 'com|org|net|edu|gov|info|biz|io|co|app|dev|cloud|eu|fr|de|es|it|nl|be|ch|at|pt|ru|uk|ca|us';
const LINK_RE = new RegExp(
    String.raw`\b(?:https?:\/\/|www\.|mailto:|tel:)[^\s<>"]+` +
    String.raw`|\b(?:[a-z0-9-]+\.)+(?:${TLDS})\b(?![@-])(?:\/[^\s<>"]*)?` +
    String.raw`|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)` +
    String.raw`|((?:\+|\b0)\d[\d ().\/-]{6,}\d)`,
    'gi',
);

const DATE_RE = /\d{1,2}[./-]\d{1,2}[./-]\d{4}/;

function trimUrl(url: string): string {
    const trimmed = url.replace(/[.,;:!?]+$/, '');
    return trimmed.endsWith(')') && !trimmed.includes('(') ? trimUrl(trimmed.slice(0, -1)) : trimmed;
}

function toUrl(match: string, email?: string, phone?: string): string | null {
    if (email) return `mailto:${email}`;
    if (phone) {
        const dial = phone.replace(/[^\d+]/g, '');
        const digits = dial.replace('+', '').length;
        return digits >= 9 && digits <= 15 && !DATE_RE.test(phone) ? `tel:${dial}` : null;
    }
    return /^[a-z]+:/i.test(match) ? match : `https://${match}`;
}

export function linkify(text: string): TextPart[] {
    const parts: TextPart[] = [];
    let last = 0;
    for (const m of text.matchAll(LINK_RE)) {
        const [raw, email, phone] = m;
        const match = email || phone ? raw : trimUrl(raw);
        const url = toUrl(match, email, phone);
        if (!url) continue;
        if (m.index > last) parts.push({text: text.slice(last, m.index)});
        parts.push({text: match, url});
        last = m.index + match.length;
    }
    if (last < text.length) parts.push({text: text.slice(last)});
    return parts;
}
