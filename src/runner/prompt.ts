export const DEFAULT_PROMPT = `בדוק את העמודים הבאים (תמונה + טקסט מחולץ לכל עמוד) ומצא טעויות טכניות ברורות.


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
[{"page": <מספר עמוד>, "text": "הטקסט המדויק מהעמוד", "error": "תיאור קצר", "fix": "התיקון"}]

שים לב לגבי שדה "text":
- חובה להעתיק את מחרוזת ה-text מילה-במילה מהטקסט המחולץ של אותו עמוד (Copy-Paste), כולל אותם תווים, אותם רווחים ואותם סוגריים בדיוק כפי שהם בטקסט המחולץ.
- אל תסדר מחדש סוגריים, פסיקים או רווחים על-פי המראה החזותי בתמונה — אם בטקסט המחולץ כתוב ")אות שלה(" אז זה הציטוט, גם אם בתמונה זה נראה "(אות שלה)". המערכת מאתרת את הטעות לפי הציטוט המדויק; ציטוט "מתוקן" יגרום לפספוס.
- רק אם הטקסט לא קיים כלל בחילוץ (פונט-תמונה), הסתמך על התמונה.

מספר העמוד הוא המספר המקומי בתוך הבאצ' (1 עד {batch_size}), לא המספר המקורי.

הנה הערות קיימות: {existing_comments}
`;

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
    .replaceAll('{batch_size}', String(pageNums.length))
    .replaceAll('{existing_comments}', existingCommentsBlock(pageNums, existing));
}
