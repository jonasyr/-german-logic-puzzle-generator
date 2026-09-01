#!/usr/bin/env python3
"""Create the printable German logic-puzzle booklet."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


PAGE_WIDTH, PAGE_HEIGHT = A4
INK = colors.HexColor('#172033')
MUTED = colors.HexColor('#5B6475')
ACCENT = colors.HexColor('#C6492D')
TEAL = colors.HexColor('#227C78')
PALE = colors.HexColor('#F3F0EA')
LINE = colors.HexColor('#C9CDD5')
WHITE = colors.white


def register_fonts() -> None:
    regular = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    bold = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont('BookSans', str(regular)))
        pdfmetrics.registerFont(TTFont('BookSans-Bold', str(bold)))
    else:
        pdfmetrics.registerFont(TTFont('BookSans', 'Helvetica'))
        pdfmetrics.registerFont(TTFont('BookSans-Bold', 'Helvetica-Bold'))


def paragraph_style(name: str, size: float, leading: float, color: colors.Color = INK, alignment: int = TA_LEFT, font: str = 'BookSans') -> ParagraphStyle:
    return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading, textColor=color, alignment=alignment)


BODY = None
SMALL = None
CLUE = None


def init_styles() -> None:
    global BODY, SMALL, CLUE
    BODY = paragraph_style('Body', 9.2, 12.2)
    SMALL = paragraph_style('Small', 7.2, 9.2, MUTED)
    CLUE = paragraph_style('Clue', 8.4, 10.7)


def draw_footer(pdf: canvas.Canvas, page_number: int, section: str) -> None:
    pdf.setStrokeColor(LINE)
    pdf.line(18 * mm, 13 * mm, PAGE_WIDTH - 18 * mm, 13 * mm)
    pdf.setFont('BookSans', 7.5)
    pdf.setFillColor(MUTED)
    pdf.drawString(18 * mm, 8.5 * mm, section)
    pdf.drawRightString(PAGE_WIDTH - 18 * mm, 8.5 * mm, str(page_number))


def draw_kicker(pdf: canvas.Canvas, text: str, y: float) -> None:
    pdf.setFillColor(ACCENT)
    pdf.roundRect(18 * mm, y - 5 * mm, 39 * mm, 7 * mm, 2 * mm, fill=1, stroke=0)
    pdf.setFillColor(WHITE)
    pdf.setFont('BookSans-Bold', 7)
    pdf.drawCentredString(37.5 * mm, y - 2.7 * mm, text.upper())


def draw_cover(pdf: canvas.Canvas, booklet: dict[str, Any], page_number: int) -> None:
    pdf.setFillColor(INK)
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    pdf.setFillColor(ACCENT)
    pdf.circle(PAGE_WIDTH - 22 * mm, PAGE_HEIGHT - 25 * mm, 42 * mm, fill=1, stroke=0)
    pdf.setFillColor(TEAL)
    pdf.circle(25 * mm, 28 * mm, 34 * mm, fill=1, stroke=0)

    pdf.setFillColor(WHITE)
    pdf.setFont('BookSans-Bold', 13)
    pdf.drawString(22 * mm, PAGE_HEIGHT - 47 * mm, 'LOGICALS / SCHWER')
    title = Paragraph(escape(booklet['title']), paragraph_style('CoverTitle', 34, 38, WHITE, font='BookSans-Bold'))
    title.wrapOn(pdf, 150 * mm, 90 * mm)
    title.drawOn(pdf, 22 * mm, PAGE_HEIGHT - 118 * mm)
    subtitle = Paragraph(escape(booklet['subtitle']), paragraph_style('CoverSub', 15, 20, colors.HexColor('#DDE1EA')))
    subtitle.wrapOn(pdf, 130 * mm, 50 * mm)
    subtitle.drawOn(pdf, 22 * mm, PAGE_HEIGHT - 148 * mm)

    pdf.setFillColor(colors.HexColor('#DDE1EA'))
    pdf.setFont('BookSans', 9)
    pdf.drawString(22 * mm, 37 * mm, '5 Kategorien  x  5 Werte  x  10 eindeutige Herausforderungen')
    pdf.setFont('BookSans-Bold', 8)
    pdf.drawString(22 * mm, 23 * mm, 'RÄTSELHEFT MIT LÖSUNGSTEIL')
    draw_footer(pdf, page_number, 'Logik unter Hochdruck')
    pdf.showPage()


def draw_category_overview(pdf: canvas.Canvas, puzzle: dict[str, Any], y: float) -> float:
    data = []
    for item in puzzle['categories']:
        data.append([
            Paragraph(escape(item['label']), paragraph_style('CatLabel', 7.5, 9, INK, font='BookSans-Bold')),
            Paragraph(escape('  ·  '.join(item['values'])), paragraph_style('CatValues', 7.4, 9, INK)),
        ])
    table = Table(data, colWidths=[32 * mm, 139 * mm], rowHeights=[9.2 * mm] * len(data))
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), PALE),
        ('BACKGROUND', (1, 0), (1, -1), colors.HexColor('#FAF9F6')),
        ('BOX', (0, 0), (-1, -1), 0.6, LINE),
        ('INNERGRID', (0, 0), (-1, -1), 0.35, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    _, height = table.wrapOn(pdf, 171 * mm, 60 * mm)
    table.drawOn(pdf, 18 * mm, y - height)
    return y - height


def draw_puzzle_clues(pdf: canvas.Canvas, puzzle: dict[str, Any], page_number: int) -> None:
    draw_kicker(pdf, f"Rätsel {puzzle['number']:02d}", PAGE_HEIGHT - 20 * mm)
    pdf.setFillColor(INK)
    pdf.setFont('BookSans-Bold', 20)
    pdf.drawString(18 * mm, PAGE_HEIGHT - 35 * mm, puzzle['title'])
    pdf.setFont('BookSans', 7.3)
    pdf.setFillColor(MUTED)
    pdf.drawRightString(PAGE_WIDTH - 18 * mm, PAGE_HEIGHT - 33 * mm, f"Seed {puzzle['seed']}  ·  {puzzle['verification']['clueCount']} Hinweise")

    story = Paragraph(escape(puzzle['story']), BODY)
    _, story_h = story.wrap(171 * mm, 28 * mm)
    story.drawOn(pdf, 18 * mm, PAGE_HEIGHT - 44 * mm - story_h)
    y = PAGE_HEIGHT - 48 * mm - story_h
    y = draw_category_overview(pdf, puzzle, y)

    goal = Paragraph(f"<b>Zielfrage:</b> {escape(puzzle['targetQuestion'])}", paragraph_style('Goal', 8.3, 11, TEAL))
    _, goal_h = goal.wrap(171 * mm, 22 * mm)
    goal.drawOn(pdf, 18 * mm, y - 5 * mm - goal_h)
    y -= 10 * mm + goal_h

    pdf.setFillColor(INK)
    pdf.setFont('BookSans-Bold', 10)
    pdf.drawString(18 * mm, y, 'Hinweise')
    y -= 5 * mm

    clues = puzzle['clues']
    midpoint = (len(clues) + 1) // 2
    columns = [clues[:midpoint], clues[midpoint:]]
    col_width = 82.5 * mm
    for col_index, column in enumerate(columns):
        x = 18 * mm + col_index * 88.5 * mm
        cursor = y
        for local_index, clue in enumerate(column):
            global_index = local_index + (0 if col_index == 0 else midpoint) + 1
            item = Paragraph(f"<b>{global_index}.</b> {escape(clue)}", CLUE)
            _, height = item.wrap(col_width, 60 * mm)
            item.drawOn(pdf, x, cursor - height)
            cursor -= height + 2.2 * mm
        if cursor < 19 * mm:
            raise ValueError(f"Hinweise von Rätsel {puzzle['number']} passen nicht auf die Seite")

    draw_footer(pdf, page_number, f"Rätsel {puzzle['number']:02d} · Hinweise")
    pdf.showPage()


def draw_grid_block(pdf: canvas.Canvas, x: float, y: float, cell: float) -> None:
    size = 5 * cell
    pdf.setStrokeColor(colors.HexColor('#9097A3'))
    pdf.setLineWidth(0.35)
    for index in range(1, 5):
        offset = index * cell
        pdf.line(x + offset, y, x + offset, y + size)
        pdf.line(x, y + offset, x + size, y + offset)
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(1.15)
    pdf.rect(x, y, size, size, fill=0, stroke=1)


def draw_triangular_logic_grid(pdf: canvas.Canvas, categories: list[dict[str, Any]]) -> None:
    if len(categories) != 5 or any(len(category['values']) != 5 for category in categories):
        raise ValueError('Das druckbare Dreiecksgitter erfordert genau fünf Kategorien mit je fünf Werten.')

    cell = 7.5 * mm
    block = 5 * cell
    grid_x = 45 * mm
    grid_top = PAGE_HEIGHT - 77 * mm
    column_categories = categories[1:]
    row_categories = [categories[0], categories[4], categories[3], categories[2]]

    pdf.setFillColor(INK)
    for block_index, category in enumerate(column_categories):
        block_x = grid_x + block_index * block
        pdf.setFont('BookSans-Bold', 7.5)
        pdf.drawCentredString(block_x + block / 2, grid_top + 27.5 * mm, category['label'])
        for value_index, value in enumerate(category['values']):
            value_x = block_x + (value_index + 0.5) * cell
            pdf.saveState()
            pdf.translate(value_x + 1.2 * mm, grid_top + 2.2 * mm)
            pdf.rotate(90)
            pdf.setFont('BookSans', 6.1)
            pdf.drawString(0, 0, value[:22])
            pdf.restoreState()

    for row_index, row_category in enumerate(row_categories):
        block_y = grid_top - (row_index + 1) * block
        pdf.saveState()
        pdf.translate(11.5 * mm, block_y + block / 2)
        pdf.rotate(90)
        pdf.setFont('BookSans-Bold', 7.4)
        pdf.drawCentredString(0, 0, row_category['label'])
        pdf.restoreState()

        pdf.setFont('BookSans', 6.2)
        for value_index, value in enumerate(row_category['values']):
            value_y = block_y + block - (value_index + 0.5) * cell - 2.1
            pdf.drawRightString(grid_x - 2.2 * mm, value_y, value[:22])

        blocks_in_row = 4 - row_index
        for column_index in range(blocks_in_row):
            draw_grid_block(pdf, grid_x + column_index * block, block_y, cell)


def draw_grid_page(pdf: canvas.Canvas, puzzle: dict[str, Any], page_number: int) -> None:
    draw_kicker(pdf, f"Rätsel {puzzle['number']:02d}", PAGE_HEIGHT - 20 * mm)
    pdf.setFillColor(INK)
    pdf.setFont('BookSans-Bold', 19)
    pdf.drawString(18 * mm, PAGE_HEIGHT - 35 * mm, 'Dein Logikgitter')
    instruction = Paragraph('Markiere sichere Zuordnungen mit <b>○</b> und Ausschlüsse mit <b>×</b>. Jede Zeile und jede Spalte enthält genau eine sichere Zuordnung.', BODY)
    instruction.wrapOn(pdf, 171 * mm, 18 * mm)
    instruction.drawOn(pdf, 18 * mm, PAGE_HEIGHT - 48 * mm)

    draw_triangular_logic_grid(pdf, puzzle['categories'])

    note = Paragraph(escape(puzzle['instructions']), SMALL)
    note.wrapOn(pdf, 171 * mm, 14 * mm)
    note.drawOn(pdf, 18 * mm, 18 * mm)
    draw_footer(pdf, page_number, f"Rätsel {puzzle['number']:02d} · Arbeitsblatt")
    pdf.showPage()


def draw_solution_page(pdf: canvas.Canvas, puzzle: dict[str, Any], page_number: int) -> None:
    draw_kicker(pdf, f"Lösung {puzzle['number']:02d}", PAGE_HEIGHT - 20 * mm)
    pdf.setFillColor(INK)
    pdf.setFont('BookSans-Bold', 19)
    pdf.drawString(18 * mm, PAGE_HEIGHT - 35 * mm, puzzle['title'])

    labels = [category['label'] for category in puzzle['categories']]
    header = [Paragraph(escape(label), paragraph_style('SolHead', 7.2, 9, WHITE, font='BookSans-Bold')) for label in labels]
    rows = [header]
    for solution in puzzle['solutionRows']:
        rows.append([Paragraph(escape(solution[label]), paragraph_style('SolCell', 7.3, 9, INK)) for label in labels])
    table = Table(rows, colWidths=[34.2 * mm] * 5, rowHeights=[11 * mm] + [13 * mm] * 5)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TEAL),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#FAF9F6')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#FAF9F6'), PALE]),
        ('BOX', (0, 0), (-1, -1), 0.7, LINE),
        ('INNERGRID', (0, 0), (-1, -1), 0.35, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    _, table_h = table.wrapOn(pdf, 171 * mm, 100 * mm)
    table.drawOn(pdf, 18 * mm, PAGE_HEIGHT - 53 * mm - table_h)

    box_y = PAGE_HEIGHT - 72 * mm - table_h
    pdf.setFillColor(PALE)
    pdf.roundRect(18 * mm, box_y - 35 * mm, 171 * mm, 35 * mm, 3 * mm, fill=1, stroke=0)
    pdf.setFillColor(TEAL)
    pdf.setFont('BookSans-Bold', 10)
    pdf.drawString(24 * mm, box_y - 10 * mm, 'Automatisch geprüft')
    verification = puzzle['verification']
    summary = (
        f"Vollständiges Gitter gelöst: ja   ·   Hinweise: {verification['clueCount']}   ·   "
        f"Hinweisarten: {verification['distinctClueTypes']}   ·   Seed: {puzzle['seed']}"
    )
    info = Paragraph(escape(summary), paragraph_style('Verify', 8.2, 11, INK))
    info.wrapOn(pdf, 155 * mm, 20 * mm)
    info.drawOn(pdf, 24 * mm, box_y - 25 * mm)

    draw_footer(pdf, page_number, f"Lösung {puzzle['number']:02d}")
    pdf.showPage()


def build_booklet(booklet: dict[str, Any], output_path: Path) -> None:
    register_fonts()
    init_styles()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
    pdf.setTitle(booklet['title'])
    pdf.setSubject(booklet['subtitle'])
    pdf.setCreator('logic-puzzle-generator')

    page = 1
    draw_cover(pdf, booklet, page)
    page += 1
    for puzzle in booklet['puzzles']:
        draw_puzzle_clues(pdf, puzzle, page)
        page += 1
        draw_grid_page(pdf, puzzle, page)
        page += 1
    for puzzle in booklet['puzzles']:
        draw_solution_page(pdf, puzzle, page)
        page += 1
    pdf.save()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_json", metavar="Eingabe-JSON")
    parser.add_argument("output_pdf", metavar="Ausgabe-PDF")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input_json)
    output_path = Path(args.output_pdf)
    with input_path.open('r', encoding='utf-8') as source:
        booklet = json.load(source)
    if not booklet.get('puzzles'):
        raise ValueError('Die Eingabe enthält keine Rätsel.')
    build_booklet(booklet, output_path)


if __name__ == "__main__":
    main()
