using ChurchSeeker.Application.Reports;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace ChurchSeeker.Infrastructure.Reports;

public sealed class PdfReportExporter : IReportExporter
{
    static PdfReportExporter() => QuestPDF.Settings.License = LicenseType.Community;

    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string Extension => "pdf";

    public byte[] Export(ReportTable t) =>
        Document.Create(doc => doc.Page(page =>
        {
            page.Size(PageSizes.A4.Landscape());
            page.Margin(30);
            page.DefaultTextStyle(x => x.FontSize(9));
            page.Header().Column(col =>
            {
                col.Item().Text(t.Title).FontSize(16).Bold();
                col.Item().Text(t.Subtitle).FontColor(Colors.Grey.Darken1);
            });
            page.Content().PaddingVertical(10).Column(col =>
            {
                col.Item().Table(table =>
                {
                    table.ColumnsDefinition(cols => { foreach (var _ in t.Headers) cols.RelativeColumn(); });
                    table.Header(h =>
                    {
                        foreach (var header in t.Headers)
                            h.Cell().Background(Colors.Grey.Lighten2).Padding(4).Text(header).Bold();
                    });
                    foreach (var row in t.Rows)
                        for (var i = 0; i < t.Headers.Count; i++)
                        {
                            var text = i < row.Count ? row[i] : string.Empty;
                            var cell = table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten1).Padding(4);
                            if (t.NumericColumns.Contains(i)) cell.AlignRight().Text(text); else cell.Text(text);
                        }
                });
                foreach (var line in t.Footer)
                    col.Item().PaddingTop(6).Text(line).Bold();
            });
            page.Footer().AlignCenter().Text(x =>
            {
                x.Span("Página ");
                x.CurrentPageNumber();
                x.Span(" de ");
                x.TotalPages();
            });
        })).GeneratePdf();
}
