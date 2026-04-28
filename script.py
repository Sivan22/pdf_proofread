#!/usr/bin/env python3
"""
PDF Editing Errors Review Script

This script sends each page of a PDF to Gemini (via Vercel AI Gateway) to find
editing errors and adds comments directly to the PDF at the error locations.

Usage:
    python review_pdf.py <input.pdf> [--output annotated.pdf] [--start-page 1] [--end-page 10]
    python review_pdf.py <input.pdf> --pages-per-batch 10 --overlap 3 --concurrency 5
"""

import argparse
import asyncio
import base64
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF not installed. Run: pip install pymupdf")
    sys.exit(1)

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai not installed. Run: pip install openai")
    sys.exit(1)


def get_existing_annotations(pdf_path: str, page_nums: list[int]) -> dict[int, list[str]]:
    """Get existing annotation comments from PDF pages."""
    doc = fitz.open(pdf_path)
    annotations: dict[int, list[str]] = {}

    for page_num in page_nums:
        page = doc[page_num]
        page_annotations = []
        for annot in page.annots() or []:
            content = annot.info.get("content", "")
            if content:
                page_annotations.append(content)
        if page_annotations:
            annotations[page_num] = page_annotations

    doc.close()
    return annotations


def extract_pdf_pages(pdf_path: str, page_nums: list[int]) -> bytes:
    """Extract multiple pages from PDF as a new PDF."""
    doc = fitz.open(pdf_path)

    new_doc = fitz.open()
    for page_num in page_nums:
        new_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)

    pdf_bytes = new_doc.tobytes()

    new_doc.close()
    doc.close()

    return pdf_bytes


def analyze_pages_for_errors(
    client: OpenAI,
    pdf_bytes: bytes,
    page_nums: list[int],
    existing_annotations: dict[int, list[str]] | None = None,
) -> list[dict]:
    """Send PDF pages to Gemini via Vercel AI Gateway and get editing errors."""

    pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")

    if len(page_nums) == 1:
        page_context = f"עמוד {page_nums[0] + 1}"
    else:
        page_context = f"עמודים {page_nums[0] + 1}-{page_nums[-1] + 1}"

    existing_comments_text = ""
    if existing_annotations:
        comments_list = []
        for page_num, comments in existing_annotations.items():
            local_page = page_nums.index(page_num) + 1 if page_num in page_nums else 0
            for comment in comments:
                comments_list.append(f"עמוד {local_page}: {comment}")
        if comments_list:
            existing_comments_text = "\n\nהערות קיימות על העמודים (אל תחזור עליהן):\n" + "\n".join(comments_list)

    prompt = f"""בדוק את {page_context} ומצא טעויות טכניות ברורות.


חפש רק טעויות טכניות ברורות:

1. מילים כפולות ברצף (אותה מילה פעמיים רצוף)
2. סימני פיסוק כפולים (,, או :: או ..)
3. אות חסרה או מיותרת באופן ברור במילה
4. טעויות ברצף מספרים או אותיות (א', ב', ג', ד', ד', ו' במקום א', ב', ג', ד', ה', ו')
5. סימני שאלה (?) שנותרו בטקסט כסימון לעורכים
6. מראי מקומות שגויים (פרק/פסוק/דף שגויים)
7. רווח מיותר לפני או אחרי סוגריים
8. כפילויות - אותו טקסט מופיע פעמיים

אל תדווח על:
- דקדוק, סגנון, עקביות כתיב, או החלטות עריכה
- כתיב יידיש
- סגנון לשון הקודש עתיק

== חשוב ==
רק טעויות ודאיות וברורות. אל תכניס דברים סתם.

אם אין טעויות ודאיות, החזר: []

אם יש, החזר JSON בלבד:
[{{"page": <מספר עמוד בPDF>, "text": "הטקסט המדויק מהעמוד", "error": "תיאור קצר", "fix": "התיקון"}}]

שים לב: מספר העמוד הוא המספר בתוך ה-PDF ששלחתי (1 עד {len(page_nums)}), לא המספר המקורי.{existing_comments_text}"""

    response = client.chat.completions.create(
        model="google/gemini-3.1-pro-preview",
        max_tokens=20000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "file",
                        "file": {
                            "data": pdf_base64,
                            "media_type": "application/pdf",
                            "filename": "pages.pdf",
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
    )

    result_text = response.choices[0].message.content.strip() if response.choices else ""

    # Parse JSON response
    if result_text == "[]" or result_text.lower() == "אין":
        return []

    try:
        # Find JSON array in response
        match = re.search(r"\[.*\]", result_text, re.DOTALL)
        if match:
            errors = json.loads(match.group())
            # Map local page numbers back to original page numbers
            for error in errors:
                local_page = error.get("page", 1)
                # Convert 1-indexed local page to 0-indexed, then map to original
                if 1 <= local_page <= len(page_nums):
                    error["page"] = page_nums[local_page - 1] + 1  # 1-indexed original
                else:
                    error["page"] = page_nums[0] + 1  # Default to first page
            return errors
        return []
    except json.JSONDecodeError:
        return []


async def analyze_pages_async(
    client: OpenAI,
    pdf_path: str,
    page_nums: list[int],
    semaphore: asyncio.Semaphore | None = None,
) -> list[dict]:
    """Async wrapper for page analysis with optional concurrency control."""

    async def do_analysis():
        loop = asyncio.get_event_loop()
        pdf_bytes = await loop.run_in_executor(None, extract_pdf_pages, pdf_path, page_nums)
        existing_annotations = await loop.run_in_executor(None, get_existing_annotations, pdf_path, page_nums)
        errors = await loop.run_in_executor(
            None,
            analyze_pages_for_errors,
            client,
            pdf_bytes,
            page_nums,
            existing_annotations,
        )
        return errors

    if semaphore:
        async with semaphore:
            return await do_analysis()
    else:
        return await do_analysis()


def add_annotations_to_page(page: fitz.Page, errors: list[dict]) -> int:
    """Add highlight annotations to a PDF page for each error."""
    annotations_added = 0

    for error in errors:
        search_text = error.get("text", "")
        error_desc = error.get("error", "")
        fix = error.get("fix", "")

        comment = f"טעות: {error_desc}\nתיקון: {fix}"

        # Search for the text in the page
        text_instances = page.search_for(search_text)

        if text_instances:
            # Add highlight annotation on the found text
            try:
                annot = page.add_highlight_annot(text_instances)
                annot.set_info(title="סקירת עריכה", content=comment)
                annot.set_colors(stroke=(1, 1, 0))  # Yellow highlight
                annot.update()
                annotations_added += 1
            except Exception:
                # Fallback to underline if highlight fails
                try:
                    annot = page.add_underline_annot(text_instances)
                    annot.set_info(title="סקירת עריכה", content=comment)
                    annot.update()
                    annotations_added += 1
                except Exception:
                    pass
        else:
            # If exact text not found, try searching for parts of it
            words = search_text.split()
            for word in words:
                if len(word) > 2:
                    instances = page.search_for(word)
                    if instances:
                        try:
                            annot = page.add_highlight_annot(instances)
                            annot.set_info(
                                title="סקירת עריכה",
                                content=f"[חיפוש: {search_text}]\n{comment}",
                            )
                            annot.set_colors(stroke=(1, 0.7, 0))  # Orange highlight
                            annot.update()
                            annotations_added += 1
                        except Exception:
                            pass
                        break

    return annotations_added


def generate_batches(start_idx: int, end_idx: int, pages_per_batch: int, overlap: int) -> list[list[int]]:
    """Generate page batches with optional overlap."""
    batches = []
    current = start_idx

    step = pages_per_batch - overlap
    if step < 1:
        step = 1

    while current < end_idx:
        batch_end = min(current + pages_per_batch, end_idx)
        batch = list(range(current, batch_end))
        batches.append(batch)
        current += step

    return batches


async def review_pdf_async(
    pdf_path: str,
    output_path: str | None = None,
    start_page: int = 1,
    end_page: int | None = None,
    pages_per_batch: int = 1,
    overlap: int = 0,
    concurrency: int = 1,
) -> tuple[str, int]:
    """Review a PDF for editing errors and add annotations (async version)."""

    client = OpenAI(
        api_key=os.getenv("AI_GATEWAY_API_KEY"),
        base_url="https://ai-gateway.vercel.sh/v1",
    )

    # Open PDF
    doc = fitz.open(pdf_path)
    total_pages = len(doc)

    # Adjust page range
    start_idx = max(0, start_page - 1)
    end_idx = min(total_pages, end_page) if end_page else total_pages

    # Generate batches
    batches = generate_batches(start_idx, end_idx, pages_per_batch, overlap)

    concurrency_str = "ללא הגבלה" if concurrency == 0 else str(concurrency)
    print(
        f"סורק {end_idx - start_idx} עמודים ב-{len(batches)} קבוצות "
        f"({pages_per_batch} עמודים לקבוצה, חפיפה {overlap}), "
        f"מקביליות: {concurrency_str}",
        file=sys.stderr,
    )

    all_errors = []
    semaphore = asyncio.Semaphore(concurrency) if concurrency > 0 else None

    # Process batches concurrently
    async def process_batch(batch: list[int]) -> list[dict]:
        batch_display = f"{batch[0] + 1}-{batch[-1] + 1}" if len(batch) > 1 else f"{batch[0] + 1}"
        print(f"סורק עמודים {batch_display}...", file=sys.stderr)
        try:
            errors = await analyze_pages_async(client, pdf_path, batch, semaphore)
            if errors:
                print(f"  עמוד {batch_display}: נמצאו {len(errors)} טעויות", file=sys.stderr)
            return errors
        except Exception as e:
            print(f"  שגיאה בקבוצה {batch_display}: {e!s}", file=sys.stderr)
            return []

    tasks = [process_batch(batch) for batch in batches]
    results = await asyncio.gather(*tasks)

    for errors in results:
        all_errors.extend(errors)

    # Deduplicate errors (in case of overlap)
    seen = set()
    unique_errors = []
    for error in all_errors:
        key = (error.get("page"), error.get("text"), error.get("error"))
        if key not in seen:
            seen.add(key)
            unique_errors.append(error)
    all_errors = unique_errors

    # Add annotations to pages
    total_annotations = 0
    pages_with_errors = set()

    for error in all_errors:
        page_num = error.get("page", 1) - 1  # Convert to 0-indexed
        if 0 <= page_num < total_pages:
            page = doc[page_num]
            added = add_annotations_to_page(page, [error])
            total_annotations += added
            if added > 0:
                pages_with_errors.add(page_num)

    # Save annotated PDF
    pdf_stem = Path(pdf_path).stem
    if not output_path:
        output_path = str(Path(pdf_path).parent / f"{pdf_stem}_reviewed.pdf")

    doc.save(output_path)
    doc.close()

    # Save errors to JSON
    json_path = str(Path(pdf_path).parent / f"{pdf_stem}_errors.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_errors, f, ensure_ascii=False, indent=2)

    print(
        f'\nסה"כ: {total_annotations} הערות ב-{len(pages_with_errors)} עמודים',
        file=sys.stderr,
    )
    print(f"PDF נשמר: {output_path}", file=sys.stderr)
    print(f"JSON נשמר: {json_path}", file=sys.stderr)

    return output_path, total_annotations


def review_pdf(
    pdf_path: str,
    output_path: str | None = None,
    start_page: int = 1,
    end_page: int | None = None,
    pages_per_batch: int = 1,
    overlap: int = 0,
    concurrency: int = 1,
) -> tuple[str, int]:
    """Sync wrapper for review_pdf_async."""
    return asyncio.run(
        review_pdf_async(
            pdf_path,
            output_path,
            start_page,
            end_page,
            pages_per_batch,
            overlap,
            concurrency,
        )
    )


def main():
    parser = argparse.ArgumentParser(description="סקירת PDF לשגיאות עריכה והוספת הערות")
    parser.add_argument("pdf_path", help="נתיב לקובץ PDF")
    parser.add_argument("--output", "-o", help="נתיב לקובץ הפלט (ברירת מחדל: <שם>_reviewed.pdf)")
    parser.add_argument("--start-page", "-s", type=int, default=1, help="עמוד התחלה (ברירת מחדל: 1)")
    parser.add_argument("--end-page", "-e", type=int, help="עמוד סיום (ברירת מחדל: כל העמודים)")
    parser.add_argument(
        "--pages-per-batch",
        "-p",
        type=int,
        default=1,
        choices=range(1, 31),
        metavar="1-30",
        help="מספר עמודים לקבוצה (1-30, ברירת מחדל: 1)",
    )
    parser.add_argument(
        "--overlap",
        type=int,
        default=0,
        help="חפיפה בין קבוצות (ברירת מחדל: 0)",
    )
    parser.add_argument(
        "--concurrency",
        "-c",
        type=int,
        default=0,
        help="מספר קריאות מקביליות ל-API (0 = ללא הגבלה, ברירת מחדל: 0)",
    )

    args = parser.parse_args()

    if not Path(args.pdf_path).exists():
        print(f"שגיאה: הקובץ לא נמצא: {args.pdf_path}", file=sys.stderr)
        sys.exit(1)

    if args.overlap >= args.pages_per_batch:
        print("שגיאה: חפיפה חייבת להיות קטנה ממספר העמודים לקבוצה", file=sys.stderr)
        sys.exit(1)

    review_pdf(
        args.pdf_path,
        args.output,
        args.start_page,
        args.end_page,
        args.pages_per_batch,
        args.overlap,
        args.concurrency,
    )


if __name__ == "__main__":
    main()
