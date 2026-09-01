#!/usr/bin/env python3
"""Create the printable German logic-puzzle booklet."""

from __future__ import annotations

import argparse
import json
import re
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
MARGIN = 18 * mm
HEX_COLOR = re.compile(r'^#[0-9A-Fa-f]{6}$')

DEFAULT_PALETTE = {
    'ink': '#172033',
    'muted': '#5B6475',
    'accent': '#C6492D',
    'secondary': '#227C78',
    'pale': '#F3F0EA',
    'line': '#C9CDD5',
}

INK = colors.HexColor(DEFAULT_PALETTE['ink'])
MUTED = colors.HexColor(DEFAULT_PALETTE['muted'])
ACCENT = colors.HexColor(DEFAULT_PALETTE['accent'])
TEAL = colors.HexColor(DEFAULT_PALETTE['secondary'])
PALE = colors.HexColor(DEFAULT_PALETTE['pale'])
LINE = colors.HexColor(DEFAULT_PALETTE['line'])
WHITE = colors.white


def apply_palette(palette: dict[str, Any] | None) -> None:
    """Overrides the booklet palette with validated hex colors from the input JSON."""
    global INK, MUTED, ACCENT, TEAL, PALE, LINE
    resolved = dict(DEFAULT_PALETTE)
    for key, value in (palette or {}).items():
        if key in resolved and isinstance(value, str) and HEX_COLOR.match(value):
            resolved[key] = value
    INK = colors.HexColor(resolved['ink'])
    MUTED = colors.HexColor(resolved['muted'])
    ACCENT = colors.HexColor(resolved['accent'])
    TEAL = colors.HexColor(resolved['secondary'])
    PALE = colors.HexColor(resolved['pale'])
    LINE = colors.HexColor(resolved['line'])


def register_fonts() -> None:
    regular = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    bold = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont('BookSans', str(regular)))
        pdfmetrics.registerFont(TTFont('BookSans-Bold', str(bold)))
    else:
        pdfmetrics.registerFont(TTFont('BookSans', 'Helvetica'))
        pdfmetrics.registerFont(TTFont('BookSans-Bold', 'Helvetica-Bold'))


def paragraph_style(name: str, size: float, leading: float, color: colors.Color | None = None, alignment: int = TA_LEFT, font: str = 'BookSans') -> ParagraphStyle:
    return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading, textColor=color if color is not None else INK, alignment=alignment)


BODY = None
SMALL = None


def init_styles() -> None:
    global BODY, SMALL
    BODY = paragraph_style('Body', 9.2, 12.2)
    SMALL = paragraph_style('Small', 7.2, 9.2, MUTED)


def clue_style(size: float) -> ParagraphStyle:
    return paragraph_style(f'Clue{size}', size, size * 1.27)


def puzzle_dimensions(puzzle: dict[str, Any]) -> tuple[int, int]:
    """Returns (number of categories, values per category) of a puzzle."""
    categories = puzzle['categories']
    return len(categories), len(categories[0]['values']) if categories else 0


def draw_footer(pdf: canvas.Canvas, page_number: int, section: str) -> None:
    pdf.setStrokeColor(LINE)
    pdf.line(MARGIN, 13 * mm, PAGE_WIDTH - MARGIN, 13 * mm)
    pdf.setFont('BookSans', 7.5)
    pdf.setFillColor(MUTED)
    pdf.drawString(MARGIN, 8.5 * mm, section)
    pdf.drawRightString(PAGE_WIDTH - MARGIN, 8.5 * mm, str(page_number))


def draw_kicker(pdf: canvas.Canvas, text: str, y: float) -> None:
    pdf.setFillColor(ACCENT)
    pdf.roundRect(MARGIN, y - 5 * mm, 39 * mm, 7 * mm, 2 * mm, fill=1, stroke=0)
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
    pdf.drawString(22 * mm, PAGE_HEIGHT - 47 * mm, 'LOGICALS')
    title = Paragraph(escape(booklet['title']), paragraph_style('CoverTitle', 34, 38, WHITE, font='BookSans-Bold'))
    title.wrapOn(pdf, 150 * mm, 90 * mm)
    title.drawOn(pdf, 22 * mm, PAGE_HEIGHT - 118 * mm)
    subtitle = Paragraph(escape(booklet['subtitle']), paragraph_style('CoverSub', 15, 20, colors.HexColor('#DDE1EA')))
    subtitle.wrapOn(pdf, 130 * mm, 50 * mm)
    subtitle.drawOn(pdf, 22 * mm, PAGE_HEIGHT - 148 * mm)

    puzzles = booklet['puzzles']
    dimensions = {puzzle_dimensions(puzzle) for puzzle in puzzles}
    if len(dimensions) == 1:
        num_categories, num_values = dimensions.pop()
        claim = f'{num_categories} Kategorien  x  {num_values} Werte  x  {len(puzzles)} eindeutige Herausforderungen'
    else:
        claim = f'{len(puzzles)} eindeutige Herausforderungen'

    pdf.setFillColor(colors.HexColor('#DDE1EA'))
    pdf.setFont('BookSans', 9)
    pdf.drawString(22 * mm, 37 * mm, claim)
    pdf.setFont('BookSans-Bold', 8)
    pdf.drawString(22 * mm, 23 * mm, 'RÄTSELHEFT MIT LÖSUNGSTEIL')
    draw_footer(pdf, page_number, booklet['title'])
    pdf.showPage()


def draw_category_overview(pdf: canvas.Canvas, puzzle: dict[str, Any], y: float) -> float:
    data = []
    for item in puzzle['categories']:
        data.append([
            Paragraph(escape(item['label']), paragraph_style('CatLabel', 7.5, 9, INK, font='BookSans-Bold')),
            Paragraph(escape('  ·  '.join(item['values'])), paragraph_style('CatValues', 7.4, 9, INK)),
        ])
    content_width = PAGE_WIDTH - 2 * MARGIN
    table = Table(data, colWidths=[32 * mm, content_width - 32 * mm], rowHeights=[9.2 * mm] * len(data))
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), PALE),
        ('BACKGROUND', (1, 0), (1, -1), colors.HexColor('#FAF9F6')),
        ('BOX', (0, 0), (-1, -1), 0.6, LINE),
        ('INNERGRID', (0, 0), (-1, -1), 0.35, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    _, height = table.wrapOn(pdf, content_width, 80 * mm)
    table.drawOn(pdf, MARGIN, y - height)
    return y - height


def layout_clues(pdf: canvas.Canvas, clues: list[str], col_width: float, top: float, bottom: float) -> tuple[float, list[list[tuple[Paragraph, float]]]]:
    """Finds the largest font size at which the clues fit into two columns."""
    midpoint = (len(clues) + 1) // 2
    for size in (8.4, 7.9, 7.4, 6.9, 6.4, 6.0):
        style = clue_style(size)
        gap = size * 0.26 * mm
        columns: list[list[tuple[Paragraph, float]]] = []
        fits = True
        for col_index, column in enumerate((clues[:midpoint], clues[midpoint:])):
            rendered: list[tuple[Paragraph, float]] = []
            cursor = top
            for local_index, clue in enumerate(column):
                number = local_index + (0 if col_index == 0 else midpoint) + 1
                item = Paragraph(f"<b>{number}.</b> {escape(clue)}", style)
                _, height = item.wrap(col_width, 120 * mm)
                rendered.append((item, height))
                cursor -= height + gap
            if cursor < bottom:
                fits = False
                break
            columns.append(rendered)
        if fits:
            return gap, columns
    raise ValueError('Die Hinweise passen auch bei kleinster Schriftgröße nicht auf eine Seite.')


def draw_puzzle_clues(pdf: canvas.Canvas, puzzle: dict[str, Any], page_number: int) -> None:
    draw_kicker(pdf, f"Rätsel {puzzle['number']:02d}", PAGE_HEIGHT - 20 * mm)
    content_width = PAGE_WIDTH - 2 * MARGIN
    pdf.setFillColor(INK)
    pdf.setFont('BookSans-Bold', 20)
    pdf.drawString(MARGIN, PAGE_HEIGHT - 35 * mm, puzzle['title'])
    pdf.setFont('BookSans', 7.3)
    pdf.setFillColor(MUTED)
    pdf.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 33 * mm, f"Seed {puzzle['seed']}  ·  {puzzle['verification']['clueCount']} Hinweise")

    story = Paragraph(escape(puzzle['story']), BODY)
    _, story_h = story.wrap(content_width, 28 * mm)
    story.drawOn(pdf, MARGIN, PAGE_HEIGHT - 44 * mm - story_h)
    y = PAGE_HEIGHT - 48 * mm - story_h
    y = draw_category_overview(pdf, puzzle, y)

    goal = Paragraph(f"<b>Zielfrage:</b> {escape(puzzle['targetQuestion'])}", paragraph_style('Goal', 8.3, 11, TEAL))
    _, goal_h = goal.wrap(content_width, 22 * mm)
    goal.drawOn(pdf, MARGIN, y - 5 * mm - goal_h)
    y -= 10 * mm + goal_h

    pdf.setFillColor(INK)
    pdf.setFont('BookSans-Bold', 10)
    pdf.drawString(MARGIN, y, 'Hinweise')
    y -= 5 * mm

    column_gap = 6 * mm
    col_width = (content_width - column_gap) / 2
    gap, columns = layout_clues(pdf, puzzle['clues'], col_width, y, 19 * mm)
    for col_index, column in enumerate(columns):
        x = MARGIN + col_index * (col_width + column_gap)
        cursor = y
        for item, height in column:
            item.drawOn(pdf, x, cursor - height)
            cursor -= height + gap

    draw_footer(pdf, page_number, f"Rätsel {puzzle['number']:02d} · Hinweise")
    pdf.showPage()


def draw_grid_block(pdf: canvas.Canvas, x: float, y: float, cell: float, steps: int) -> None:
    size = steps * cell
    pdf.setStrokeColor(colors.HexColor('#9097A3'))
    pdf.setLineWidth(0.35)
    for index in range(1, steps):
        offset = index * cell
        pdf.line(x + offset, y, x + offset, y + size)
        pdf.line(x, y + offset, x + size, y + offset)
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(1.15)
    pdf.rect(x, y, size, size, fill=0, stroke=1)


def draw_triangular_logic_grid(pdf: canvas.Canvas, categories: list[dict[str, Any]]) -> None:
    num_categories = len(categories)
    if num_categories < 3:
        raise ValueError('Das Logikgitter benötigt mindestens drei Kategorien.')
    num_values = len(categories[0]['values'])
    if any(len(category['values']) != num_values for category in categories):
        raise ValueError('Alle Kategorien müssen gleich viele Werte enthalten.')

    blocks = num_categories - 1
    label_width = 27 * mm
    grid_x = MARGIN + label_width
    grid_top = PAGE_HEIGHT - 77 * mm
    available_width = PAGE_WIDTH - grid_x - 15 * mm
    available_height = grid_top - 24 * mm
    # Small grids grow up to 11 mm per cell so the worksheet stays comfortable to write in.
    cell = min(11 * mm, available_width / (blocks * num_values), available_height / (blocks * num_values))
    block = num_values * cell
    scale = cell / (7.5 * mm)

    value_font = max(4.4, min(7.0, 6.1 * scale))
    label_font = max(5.2, min(8.0, 7.5 * scale))
    max_chars = 22

    # Columns run left to right over categories 2..n; rows start with the first category
    # and then walk the remaining categories backwards, which yields the classic triangle.
    column_categories = categories[1:]
    row_categories = [categories[0]] + list(reversed(categories[2:]))

    pdf.setFillColor(INK)
    for block_index, category in enumerate(column_categories):
        block_x = grid_x + block_index * block
        pdf.setFont('BookSans-Bold', label_font)
        pdf.drawCentredString(block_x + block / 2, grid_top + 27.5 * mm, category['label'])
        for value_index, value in enumerate(category['values']):
            value_x = block_x + (value_index + 0.5) * cell
            pdf.saveState()
            pdf.translate(value_x + value_font * 0.4, grid_top + 2.2 * mm)
            pdf.rotate(90)
            pdf.setFont('BookSans', value_font)
            pdf.drawString(0, 0, value[:max_chars])
            pdf.restoreState()

    for row_index, row_category in enumerate(row_categories):
        block_y = grid_top - (row_index + 1) * block
        pdf.saveState()
        pdf.translate(11.5 * mm, block_y + block / 2)
        pdf.rotate(90)
        pdf.setFont('BookSans-Bold', label_font)
        pdf.drawCentredString(0, 0, row_category['label'])
        pdf.restoreState()

        pdf.setFont('BookSans', value_font)
        for value_index, value in enumerate(row_category['values']):
            value_y = block_y + block - (value_index + 0.5) * cell - value_font * 0.34
            pdf.drawRightString(grid_x - 2.2 * mm, value_y, value[:max_chars])

        blocks_in_row = blocks - row_index
        for column_index in range(blocks_in_row):
            draw_grid_block(pdf, grid_x + column_index * block, block_y, cell, num_values)


def draw_grid_page(pdf: canvas.Canvas, puzzle: dict[str, Any], page_number: int) -> None:
    draw_kicker(pdf, f"Rätsel {puzzle['number']:02d}", PAGE_HEIGHT - 20 * mm)
    content_width = PAGE_WIDTH - 2 * MARGIN
    pdf.setFillColor(INK)
    pdf.setFont('BookSans-Bold', 19)
    pdf.drawString(MARGIN, PAGE_HEIGHT - 35 * mm, 'Dein Logikgitter')
    instruction = Paragraph('Markiere sichere Zuordnungen mit <b>○</b> und Ausschlüsse mit <b>×</b>. Jede Zeile und jede Spalte enthält genau eine sichere Zuordnung.', BODY)
    instruction.wrapOn(pdf, content_width, 18 * mm)
    instruction.drawOn(pdf, MARGIN, PAGE_HEIGHT - 48 * mm)

    draw_triangular_logic_grid(pdf, puzzle['categories'])

    note = Paragraph(escape(puzzle['instructions']), SMALL)
    note.wrapOn(pdf, content_width, 14 * mm)
    note.drawOn(pdf, MARGIN, 18 * mm)
    draw_footer(pdf, page_number, f"Rätsel {puzzle['number']:02d} · Arbeitsblatt")
    pdf.showPage()


def draw_solution_page(pdf: canvas.Canvas, puzzle: dict[str, Any], page_number: int) -> None:
    draw_kicker(pdf, f"Lösung {puzzle['number']:02d}", PAGE_HEIGHT - 20 * mm)
    content_width = PAGE_WIDTH - 2 * MARGIN
    pdf.setFillColor(INK)
    pdf.setFont('BookSans-Bold', 19)
    pdf.drawString(MARGIN, PAGE_HEIGHT - 35 * mm, puzzle['title'])

    labels = [category['label'] for category in puzzle['categories']]
    header = [Paragraph(escape(label), paragraph_style('SolHead', 7.2, 9, WHITE, font='BookSans-Bold')) for label in labels]
    rows = [header]
    for solution in puzzle['solutionRows']:
        rows.append([Paragraph(escape(solution[label]), paragraph_style('SolCell', 7.3, 9, INK)) for label in labels])

    num_rows = len(puzzle['solutionRows'])
    row_height = min(13 * mm, max(8 * mm, 120 * mm / max(1, num_rows)))
    table = Table(
        rows,
        colWidths=[content_width / len(labels)] * len(labels),
        rowHeights=[11 * mm] + [row_height] * num_rows,
    )
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
    _, table_h = table.wrapOn(pdf, content_width, 150 * mm)
    table.drawOn(pdf, MARGIN, PAGE_HEIGHT - 53 * mm - table_h)

    box_y = PAGE_HEIGHT - 72 * mm - table_h
    pdf.setFillColor(PALE)
    pdf.roundRect(MARGIN, box_y - 35 * mm, content_width, 35 * mm, 3 * mm, fill=1, stroke=0)
    pdf.setFillColor(TEAL)
    pdf.setFont('BookSans-Bold', 10)
    pdf.drawString(24 * mm, box_y - 10 * mm, 'Automatisch geprüft')
    verification = puzzle['verification']
    summary = (
        f"Vollständiges Gitter gelöst: ja   ·   Hinweise: {verification['clueCount']}   ·   "
        f"Hinweisarten: {verification['distinctClueTypes']}   ·   Seed: {puzzle['seed']}"
    )
    info = Paragraph(escape(summary), paragraph_style('Verify', 8.2, 11, INK))
    info.wrapOn(pdf, content_width - 12 * mm, 20 * mm)
    info.drawOn(pdf, 24 * mm, box_y - 25 * mm)

    draw_footer(pdf, page_number, f"Lösung {puzzle['number']:02d}")
    pdf.showPage()


def build_booklet(booklet: dict[str, Any], output_path: Path) -> None:
    register_fonts()
    apply_palette(booklet.get('colors'))
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
