export const DEFAULT_PROMPT = `בדוק את קובץ הPDF הזה ומצא טעויות טכניות ברורות.


חפש רק טעויות טכניות ברורות:

1. מילים כפולות ברצף (אותה מילה פעמיים רצוף)
2. סימני פיסוק כפולים (,, או :: או ..)
3. אות חסרה או מיותרת באופן ברור במילה
4. טעויות ברצף מספרים או אותיות (א', ב', ג', ד', ד', ו' במקום א', ב', ג', ד', ה', ו')
5. סימני שאלה (?) שנותרו בטקסט כסימון לעורכים
6. מראי מקומות שגויים (פרק/פסוק/דף שגויים)
7. רווח מיותר לפני או אחרי סוגריים
8. כפילויות - אותו טקסט מופיע פעמיים
9. טעויות עימוד - שורה אלמנה, מילים יתומות, שיבוש בצורת הדף
10. שגיאות/חוסר במספרי עמודים
11. שגיאות בכותרות

אל תדווח על:
- דקדוק, סגנון, עקביות כתיב, או החלטות עריכה

== חשוב ==
רק טעויות ודאיות וברורות. אל תכניס דברים סתם.

אם אין טעויות ודאיות, החזר: []

אם יש, החזר JSON בלבד:
[{"page": <מספר עמוד בPDF>, "text": "הטקסט המדויק מהעמוד", "error": "תיאור קצר", "fix": "התיקון"}]

שים לב: מספר העמוד הוא המספר בתוך ה-PDF ששלחתי (1 עד {batch_size}), לא המספר המקורי.

הנה התוכן של הדף: {page_context}

הנה הערות קיימות: {existing_comments}
`;

function pageContext(pageNums: number[]): string {
  if (pageNums.length === 1) return `עמוד ${pageNums[0] + 1}`;
  return `עמודים ${pageNums[0] + 1}-${pageNums[pageNums.length - 1] + 1}`;
}

function existingCommentsBlock(
  pageNums: number[],
  existing: Record<number, string[]>,
): string {
  const lines: string[] = [];
  for (const pageNum of pageNums) {
    const comments = existing[pageNum];
    if (!comments?.length) continue;
    const localPage = pageNums.indexOf(pageNum) + 1;
    for (const comment of comments) {
      lines.push(`עמוד ${localPage}: ${comment}`);
    }
  }
  return lines.length ? lines.join('\n') : 'אין';
}

export function buildPrompt(
  template: string,
  pageNums: number[],
  existing: Record<number, string[]>,
): string {
  return template
    .replaceAll('{page_context}', pageContext(pageNums))
    .replaceAll('{batch_size}', String(pageNums.length))
    .replaceAll('{existing_comments}', existingCommentsBlock(pageNums, existing));
}
