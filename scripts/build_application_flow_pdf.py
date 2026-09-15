from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "ira-preregister-business-flow.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#0F172A")
SLATE = colors.HexColor("#475569")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#CBD5E1")
PALE = colors.HexColor("#F8FAFC")
TEAL = colors.HexColor("#0F766E")
TEAL_LIGHT = colors.HexColor("#CCFBF1")
BLUE = colors.HexColor("#2563EB")
BLUE_LIGHT = colors.HexColor("#DBEAFE")
AMBER = colors.HexColor("#B45309")
AMBER_LIGHT = colors.HexColor("#FEF3C7")
RED = colors.HexColor("#B91C1C")
RED_LIGHT = colors.HexColor("#FEE2E2")
PURPLE = colors.HexColor("#7C3AED")
PURPLE_LIGHT = colors.HexColor("#EDE9FE")
GREEN = colors.HexColor("#15803D")
GREEN_LIGHT = colors.HexColor("#DCFCE7")

styles = getSampleStyleSheet()
BODY = ParagraphStyle(
    "BodyCustom", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2,
    leading=13, textColor=SLATE, spaceAfter=4,
)
SMALL = ParagraphStyle(
    "SmallCustom", parent=BODY, fontSize=7.6, leading=10, textColor=SLATE,
)
BOX = ParagraphStyle(
    "BoxCustom", parent=BODY, fontSize=8.2, leading=10.2, alignment=TA_CENTER,
    textColor=NAVY,
)
BOX_SMALL = ParagraphStyle(
    "BoxSmallCustom", parent=BOX, fontSize=7.2, leading=8.8,
)
WHITE_BOX = ParagraphStyle(
    "WhiteBox", parent=BOX, textColor=colors.white,
)
TABLE = ParagraphStyle(
    "TableCustom", parent=BODY, fontSize=7.4, leading=9.2, spaceAfter=0,
)


def para(c, x, y, w, h, text, style=BODY):
    p = Paragraph(text, style)
    _, ph = p.wrap(w, h)
    p.drawOn(c, x, y + h - ph)
    return ph


def title(c, number, heading, subtitle=None):
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(42, PAGE_H - 58, heading)
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(42, PAGE_H - 38, f"IRA PREREGIST  /  BUSINESS FLOW  /  {number:02d}")
    if subtitle:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(42, PAGE_H - 76, subtitle)


def footer(c, page_number):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(42, 28, PAGE_W - 42, 28)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(42, 16, "IRA Preregist - Business Flow")
    c.drawRightString(PAGE_W - 42, 16, f"Page {page_number}")


def box(c, x, y, w, h, text, fill=PALE, stroke=LINE, style=BOX, radius=8, bold_prefix=None):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    if bold_prefix and text.startswith(bold_prefix):
        text = f"<b>{escape(bold_prefix)}</b>{escape(text[len(bold_prefix):])}"
    para(c, x + 7, y + 5, w - 14, h - 10, text, style)


def pill(c, x, y, w, text, fill, text_color=NAVY):
    c.setFillColor(fill)
    c.roundRect(x, y, w, 18, 9, fill=1, stroke=0)
    c.setFillColor(text_color)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawCentredString(x + w / 2, y + 6, text)


def arrow(c, x1, y1, x2, y2, color=SLATE, dashed=False):
    c.saveState()
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.2)
    if dashed:
        c.setDash(3, 2)
    c.line(x1, y1, x2, y2)
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    size = 5
    left = (x2 - size * math.cos(angle - math.pi / 6), y2 - size * math.sin(angle - math.pi / 6))
    right = (x2 - size * math.cos(angle + math.pi / 6), y2 - size * math.sin(angle + math.pi / 6))
    c.line(x2, y2, left[0], left[1])
    c.line(x2, y2, right[0], right[1])
    c.restoreState()


def decision(c, x, y, w, h, text, fill=AMBER_LIGHT, stroke=AMBER, style=BOX_SMALL):
    points = [(x + w / 2, y + h), (x + w, y + h / 2), (x + w / 2, y), (x, y + h / 2)]
    path = c.beginPath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    path.close()
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1)
    c.drawPath(path, fill=1, stroke=1)
    para(c, x + 15, y + 10, w - 30, h - 20, text, style)


def section_label(c, x, y, text, color=TEAL):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y, text.upper())
    c.setStrokeColor(color)
    c.setLineWidth(1.5)
    c.line(x, y - 5, x + 32, y - 5)


def page_cover(c):
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, PAGE_H - 16 * mm, PAGE_W, 16 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(44, PAGE_H - 10 * mm, "IRA PREREGIST  /  BUSINESS FLOW")
    c.setFont("Helvetica-Bold", 30)
    c.drawString(44, PAGE_H - 92 * mm, "Customer Location")
    c.drawString(44, PAGE_H - 106 * mm, "Verification Journey")
    c.setFillColor(colors.HexColor("#99F6E4"))
    c.setFont("Helvetica", 12)
    c.drawString(47, PAGE_H - 121 * mm, "Alur bisnis dari data customer, campaign WhatsApp,")
    c.drawString(47, PAGE_H - 128 * mm, "sampai keputusan verifikasi lokasi.")

    # Compact journey ribbon.
    y = 180
    labels = ["DATA", "CAMPAIGN", "CUSTOMER", "VALIDASI", "TINDAK LANJUT"]
    fills = [BLUE, PURPLE, TEAL, AMBER, GREEN]
    x = 44
    for index, label in enumerate(labels):
        pill(c, x, y, 90 if index < 4 else 106, label, fills[index], colors.white)
        x += 98 if index < 4 else 0
        if index < len(labels) - 1:
            c.setStrokeColor(colors.HexColor("#64748B"))
            c.setLineWidth(1)
            c.line(x - 8, y + 9, x + 2, y + 9)
    c.setFillColor(colors.HexColor("#CBD5E1"))
    c.setFont("Helvetica", 8)
    c.drawString(44, 64, "Dokumen business flow")
    c.drawRightString(PAGE_W - 44, 64, datetime.now().strftime("%d %B %Y"))
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica", 7.5)
    c.drawString(44, 43, "Fokus: proses bisnis, keputusan, status, dan tanggung jawab pengguna")


def page_overview(c):
    title(c, 1, "Gambaran besar", "Lima tahap utama perjalanan customer")
    y = 520
    x = 42
    widths = [91, 91, 91, 91, 112]
    labels = [
        ("1", "Data customer", "Customer dan alamat tersedia"),
        ("2", "Campaign", "Target dan pesan disiapkan"),
        ("3", "Verifikasi", "Customer mengonfirmasi data dan lokasi"),
        ("4", "Keputusan", "Lokasi disetujui atau perlu review"),
        ("5", "Tindak lanjut", "Admin menyelesaikan kasus"),
    ]
    fills = [BLUE_LIGHT, PURPLE_LIGHT, TEAL_LIGHT, AMBER_LIGHT, GREEN_LIGHT]
    strokes = [BLUE, PURPLE, TEAL, AMBER, GREEN]
    for i, ((num, head, desc), w) in enumerate(zip(labels, widths)):
        box(c, x, y, w, 106, f"<b>{num}. {head}</b><br/><br/>{desc}", fills[i], strokes[i], BOX_SMALL)
        if i < len(labels) - 1:
            arrow(c, x + w + 3, y + 53, x + w + 14, y + 53)
        x += w + (17 if i < len(labels) - 1 else 0)

    section_label(c, 42, 450, "Tujuan bisnis")
    para(c, 42, 330, 510, 100,
         "Aplikasi membantu tim memastikan bahwa data alamat customer benar, mengirim undangan verifikasi secara terukur, "
         "mengumpulkan konfirmasi lokasi dari customer, dan menyediakan daftar tindak lanjut untuk kasus yang belum dapat disetujui.", BODY)

    section_label(c, 42, 295, "Peran utama")
    role_data = [
        [Paragraph("<b>Aktor</b>", TABLE), Paragraph("<b>Tanggung jawab bisnis</b>", TABLE)],
        [Paragraph("Admin", TABLE), Paragraph("Menyiapkan data, membuat campaign, memonitor progress, dan menindaklanjuti kasus.", TABLE)],
        [Paragraph("Reviewer", TABLE), Paragraph("Memeriksa hasil yang masuk Needs Review dan menentukan tindakan berikutnya.", TABLE)],
        [Paragraph("Customer", TABLE), Paragraph("Mengonfirmasi data, memberi izin lokasi, dan mengirim lokasi GPS.", TABLE)],
        [Paragraph("Provider WhatsApp", TABLE), Paragraph("Menyampaikan pesan dan memberikan status pengiriman.", TABLE)],
    ]
    table = Table(role_data, colWidths=[110, 400], rowHeights=[24, 34, 34, 34, 34])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), PALE),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    table.wrapOn(c, PAGE_W - 84, 170)
    table.drawOn(c, 42, 170)


def page_end_to_end(c):
    title(c, 2, "Business flow end-to-end", "Dari customer terdaftar sampai proses selesai")
    x = 58
    w = 168
    y = 672
    h = 42
    steps = [
        ("Customer terdaftar", BLUE_LIGHT, BLUE),
        ("Periksa kelayakan alamat dan nomor WhatsApp", BLUE_LIGHT, BLUE),
        ("Admin memilih target campaign", PURPLE_LIGHT, PURPLE),
        ("Preview recipient dan pesan", PURPLE_LIGHT, PURPLE),
        ("Undangan dikirim melalui WhatsApp", TEAL_LIGHT, TEAL),
        ("Customer membuka link dan konfirmasi data", TEAL_LIGHT, TEAL),
        ("Customer memberi consent dan mengirim lokasi", TEAL_LIGHT, TEAL),
    ]
    coords = []
    for label, fill, stroke in steps:
        box(c, x, y, w, h, label, fill, stroke, BOX_SMALL)
        coords.append((x, y, w, h))
        if y > 220:
            arrow(c, x + w / 2, y - 3, x + w / 2, y - 16)
        y -= 63

    decision_x = 290
    decision_y = 333
    decision(c, decision_x, decision_y, 124, 68, "Data lokasi cukup dan akurat?")
    arrow(c, x + w + 4, coords[-1][1] + 21, decision_x - 5, decision_y + 34)
    box(c, 458, 350, 98, 38, "Ulangi pengambilan atau tunggu di rumah", RED_LIGHT, RED, BOX_SMALL)
    arrow(c, decision_x + 124, decision_y + 34, 453, 369, RED)
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(420, 386, "Tidak")
    arrow(c, decision_x + 62, decision_y - 3, decision_x + 62, 296, TEAL)
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(decision_x + 70, 308, "Ya")

    box(c, decision_x, 244, 124, 42, "Validasi alamat dan lokasi", AMBER_LIGHT, AMBER, BOX_SMALL)
    arrow(c, decision_x + 62, 240, decision_x + 62, 225, AMBER)
    decision(c, decision_x, 142, 124, 68, "Hasil validasi")

    box(c, 54, 90, 116, 42, "LOCATION_VALID\nLokasi disetujui", GREEN_LIGHT, GREEN, BOX_SMALL)
    box(c, 226, 90, 116, 42, "NEEDS_REVIEW\nPerlu pemeriksaan", AMBER_LIGHT, AMBER, BOX_SMALL)
    box(c, 398, 90, 116, 42, "WAITING_FOR_HOME\nMenunggu proses", BLUE_LIGHT, BLUE, BOX_SMALL)
    arrow(c, decision_x + 8, 142, 112, 137, GREEN)
    arrow(c, decision_x + 62, 139, 284, 137, AMBER)
    arrow(c, decision_x + 116, 142, 456, 137, BLUE)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawCentredString(112, 73, "Selesai / monitor")
    c.drawCentredString(284, 73, "Review admin")
    c.drawCentredString(456, 73, "Reminder / coba lagi")


def page_data_campaign(c):
    title(c, 3, "Data customer dan campaign", "Menyiapkan recipient yang tepat sebelum pengiriman")
    section_label(c, 42, 700, "A. Pengelolaan data customer", BLUE)
    y = 615
    xs = [48, 174, 300, 426]
    labels = ["Import data", "Rapikan format", "Customer sudah ada?", "Customer siap dipakai"]
    fills = [BLUE_LIGHT, BLUE_LIGHT, AMBER_LIGHT, GREEN_LIGHT]
    strokes = [BLUE, BLUE, AMBER, GREEN]
    for i, (x, label) in enumerate(zip(xs, labels)):
        if i == 2:
            decision(c, x, y, 104, 58, label, fills[i], strokes[i])
        else:
            box(c, x, y, 104, 58, label, fills[i], strokes[i], BOX_SMALL)
        if i < len(xs) - 1:
            arrow(c, x + 107, y + 29, xs[i + 1] - 4, y + 29)
    box(c, 182, 520, 104, 36, "Perbarui data", BLUE_LIGHT, BLUE, BOX_SMALL)
    box(c, 316, 520, 104, 36, "Buat customer baru", BLUE_LIGHT, BLUE, BOX_SMALL)
    arrow(c, 326, 614, 234, 558, BLUE)
    arrow(c, 352, 614, 368, 558, BLUE)
    para(c, 42, 460, 510, 42,
         "Customer yang dapat dipilih untuk campaign harus memiliki nomor WhatsApp yang dapat digunakan, "
         "belum opt-out, dan memiliki alamat yang perlu diverifikasi.", BODY)

    section_label(c, 42, 415, "B. Campaign WhatsApp", PURPLE)
    y = 340
    steps = [
        ("Tentukan target customer", PURPLE_LIGHT, PURPLE),
        ("Tentukan template pesan dan jadwal", PURPLE_LIGHT, PURPLE),
        ("Preview recipient dan pesan", PURPLE_LIGHT, PURPLE),
        ("Admin mulai campaign", TEAL_LIGHT, TEAL),
    ]
    for i, (label, fill, stroke) in enumerate(steps):
        x = 48 + i * 126
        box(c, x, y, 104, 54, label, fill, stroke, BOX_SMALL)
        if i < len(steps) - 1:
            arrow(c, x + 107, y + 27, x + 122, y + 27)
    box(c, 162, 230, 120, 48, "Campaign tetap draft", PALE, LINE, BOX_SMALL)
    decision(c, 330, 219, 118, 70, "Campaign siap dikirim?")
    arrow(c, 352, 337, 389, 289, AMBER)
    arrow(c, 330, 254, 288, 254, SLATE)
    c.setFillColor(SLATE)
    c.setFont("Helvetica-Bold", 7)
    c.drawRightString(321, 260, "Belum")
    c.drawString(394, 295, "Ya")
    arrow(c, 389, 216, 389, 186, TEAL)
    box(c, 327, 124, 124, 48, "Campaign berjalan", TEAL_LIGHT, TEAL, BOX_SMALL)
    para(c, 42, 65, 510, 34,
         "Setiap recipient kemudian diperiksa kembali. Recipient yang tidak memenuhi syarat dilewati, "
         "sedangkan recipient yang lolos dikirim sesuai quota dan jadwal.", BODY)


def page_verification(c):
    title(c, 4, "Customer verification flow", "Customer memberikan konfirmasi data dan bukti lokasi")
    section_label(c, 42, 700, "Perjalanan customer", TEAL)
    x = 58
    w = 142
    y = 615
    h = 44
    customer_steps = [
        "Membuka link verifikasi",
        "Konfirmasi data customer",
        "Alamat sesuai?",
        "Memberi persetujuan lokasi",
        "Mengirim sampel GPS",
    ]
    for i, label in enumerate(customer_steps):
        if i == 2:
            decision(c, x, y, w, 58, label, AMBER_LIGHT, AMBER)
            height = 58
        else:
            box(c, x, y, w, h, label, TEAL_LIGHT if i >= 3 else BLUE_LIGHT, TEAL if i >= 3 else BLUE, BOX_SMALL)
            height = h
        if i < len(customer_steps) - 1:
            arrow(c, x + w / 2, y - 3, x + w / 2, y - 17)
        y -= 68

    box(c, 288, 490, 118, 42, "Masukkan alamat baru", AMBER_LIGHT, AMBER, BOX_SMALL)
    box(c, 438, 490, 112, 42, "Alamat diproses", AMBER_LIGHT, AMBER, BOX_SMALL)
    arrow(c, x + w + 5, 615 - 2 * 68 + 29, 282, 511, AMBER)
    arrow(c, 408, 511, 433, 511, AMBER)
    arrow(c, 494, 486, 494, 452, TEAL)
    arrow(c, x + w / 2, 615 - 3 * 68 - 3, x + w / 2, 404)
    box(c, 48, 344, 156, 48, "Bandingkan dengan alamat terdaftar", AMBER_LIGHT, AMBER, BOX_SMALL)
    decision(c, 240, 330, 130, 76, "Data lokasi cukup akurat?")
    arrow(c, 129, 341, 234, 368, AMBER)
    box(c, 410, 348, 126, 42, "Ulangi atau tunggu di rumah", RED_LIGHT, RED, BOX_SMALL)
    arrow(c, 370, 368, 405, 369, RED)
    arrow(c, 305, 326, 305, 292, AMBER)
    box(c, 242, 236, 126, 42, "Validasi bisnis lokasi", AMBER_LIGHT, AMBER, BOX_SMALL)
    arrow(c, 305, 232, 305, 216, AMBER)
    decision(c, 240, 126, 130, 70, "Keputusan verifikasi")
    arrow(c, 305, 212, 305, 200, AMBER)
    box(c, 54, 58, 116, 40, "Valid\nDisetujui", GREEN_LIGHT, GREEN, BOX_SMALL)
    box(c, 226, 58, 116, 40, "Review\nNeeds Review", AMBER_LIGHT, AMBER, BOX_SMALL)
    box(c, 398, 58, 116, 40, "Waiting for Home\nReminder", BLUE_LIGHT, BLUE, BOX_SMALL)
    arrow(c, 248, 132, 112, 102, GREEN)
    arrow(c, 305, 123, 284, 102, AMBER)
    arrow(c, 362, 132, 456, 102, BLUE)


def page_monitoring(c):
    title(c, 5, "Monitoring dan tindak lanjut", "Admin memantau status dan menyelesaikan kasus")
    section_label(c, 42, 700, "Flow monitoring", GREEN)
    x_positions = [48, 147, 246, 345, 444]
    y = 603
    stages = [
        ("Lihat progress campaign", BLUE_LIGHT, BLUE),
        ("Lihat status recipient", PURPLE_LIGHT, PURPLE),
        ("Periksa hasil verifikasi", TEAL_LIGHT, TEAL),
        ("Tentukan tindakan", AMBER_LIGHT, AMBER),
        ("Selesai", GREEN_LIGHT, GREEN),
    ]
    for i, (label, fill, stroke) in enumerate(stages):
        x = x_positions[i]
        box(c, x, y, 90, 50, label, fill, stroke, BOX_SMALL)
        if i < len(stages) - 1:
            arrow(c, x + 93, y + 25, x_positions[i + 1] - 4, y + 25)
    para(c, 42, 520, 510, 45,
         "Monitoring membantu admin membedakan recipient yang masih menunggu, sudah berhasil, gagal dikirim, "
         "atau membutuhkan pemeriksaan manual.", BODY)

    section_label(c, 42, 470, "Arti status bisnis", AMBER)
    rows = [
        [Paragraph("<b>Status</b>", TABLE), Paragraph("<b>Arti</b>", TABLE), Paragraph("<b>Tindakan</b>", TABLE)],
        [Paragraph("LOCATION_VALID", TABLE), Paragraph("Alamat dan lokasi memenuhi aturan verifikasi.", TABLE), Paragraph("Tandai berhasil dan monitor.", TABLE)],
        [Paragraph("NEEDS_REVIEW / MANUAL_REVIEW", TABLE), Paragraph("Hasil belum dapat disetujui otomatis atau ada ketidaksesuaian.", TABLE), Paragraph("Reviewer memeriksa data dan evidence.", TABLE)],
        [Paragraph("WAITING_FOR_HOME", TABLE), Paragraph("Customer belum berada di lokasi rumah atau perlu mencoba lagi.", TABLE), Paragraph("Tunggu atau kirim reminder.", TABLE)],
        [Paragraph("LOW_GPS_ACCURACY", TABLE), Paragraph("Sinyal GPS belum cukup akurat.", TABLE), Paragraph("Arahkan customer mengulang pengambilan lokasi.", TABLE)],
        [Paragraph("ADDRESS_PROPOSED", TABLE), Paragraph("Customer mengusulkan perubahan alamat.", TABLE), Paragraph("Proses dan tinjau alamat baru.", TABLE)],
        [Paragraph("SENT / FAILED / OPTED_OUT", TABLE), Paragraph("Status pengiriman WhatsApp.", TABLE), Paragraph("Tunggu, tindak lanjuti, atau hentikan pengiriman.", TABLE)],
    ]
    table = Table(rows, colWidths=[145, 210, 155], rowHeights=[23, 32, 42, 42, 32, 32, 38])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), PALE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PALE, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    table.wrapOn(c, PAGE_W - 84, 315)
    table.drawOn(c, 42, 170)
    box(c, 42, 78, 510, 58,
        "Proses customer selesai ketika lokasi valid, reviewer menyelesaikan pemeriksaan manual, atau customer tidak dapat diproses lebih lanjut karena gagal, opt-out, atau data tidak valid.",
        GREEN_LIGHT, GREEN, BOX_SMALL)


def page_campaign_exceptions(c):
    title(c, 6, "Kondisi khusus campaign", "Bagaimana sistem bisnis menangani recipient yang belum dapat dikirim")
    section_label(c, 42, 700, "Keputusan pengiriman", PURPLE)
    decision(c, 230, 585, 136, 74, "Recipient masih memenuhi syarat?")
    box(c, 56, 500, 132, 48, "Tidak: recipient dilewati", RED_LIGHT, RED, BOX_SMALL)
    box(c, 408, 500, 132, 48, "Ya: periksa quota", PURPLE_LIGHT, PURPLE, BOX_SMALL)
    arrow(c, 230, 622, 194, 524, RED)
    arrow(c, 366, 622, 403, 524, PURPLE)
    decision(c, 230, 365, 136, 74, "Quota pengiriman tersedia?")
    arrow(c, 474, 495, 366, 402, PURPLE)
    box(c, 56, 280, 132, 48, "Tidak: jadwalkan ke waktu berikutnya", AMBER_LIGHT, AMBER, BOX_SMALL)
    box(c, 408, 280, 132, 48, "Ya: kirim WhatsApp", TEAL_LIGHT, TEAL, BOX_SMALL)
    arrow(c, 230, 402, 194, 304, AMBER)
    arrow(c, 366, 402, 403, 304, TEAL)
    arrow(c, 474, 275, 474, 230, TEAL)
    box(c, 408, 170, 132, 42, "Provider menerima pesan", GREEN_LIGHT, GREEN, BOX_SMALL)
    box(c, 56, 170, 132, 42, "Retry atau tandai gagal", RED_LIGHT, RED, BOX_SMALL)
    decision(c, 230, 148, 136, 72, "Pengiriman berhasil?")
    arrow(c, 408, 191, 366, 184, GREEN)
    arrow(c, 230, 365, 230, 225, TEAL)
    arrow(c, 230, 148, 194, 191, RED)
    arrow(c, 366, 184, 403, 191, GREEN)

    section_label(c, 42, 100, "Prinsip bisnis")
    para(c, 42, 46, 510, 42,
         "Recipient tidak hilang ketika belum dapat dikirim. Recipient tetap tercatat sebagai pending dan dapat dijadwalkan kembali, "
         "sedangkan kegagalan permanen masuk ke monitoring untuk tindak lanjut admin.", BODY)


def build():
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle("IRA Preregist - Business Flow")
    c.setAuthor("IRA Preregist")
    pages = [page_cover, page_overview, page_end_to_end, page_data_campaign, page_verification, page_monitoring, page_campaign_exceptions]
    for page_number, page in enumerate(pages, start=1):
        page(c)
        if page_number > 1:
            footer(c, page_number - 1)
        c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
