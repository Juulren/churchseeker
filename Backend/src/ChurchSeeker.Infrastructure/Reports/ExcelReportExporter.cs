using System.Globalization;
using ChurchSeeker.Application.Reports;
using ClosedXML.Excel;

namespace ChurchSeeker.Infrastructure.Reports;

public sealed class ExcelReportExporter : IReportExporter
{
    public ReportFormat Format => ReportFormat.Xlsx;
    public string ContentType => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public string Extension => "xlsx";

    public byte[] Export(ReportTable t)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Reporte");
        ws.Cell(1, 1).Value = Safe(t.Title);
        ws.Cell(1, 1).Style.Font.Bold = true;
        ws.Cell(1, 1).Style.Font.FontSize = 14;
        ws.Cell(2, 1).Value = Safe(t.Subtitle);

        const int headerRow = 4;
        for (var c = 0; c < t.Headers.Count; c++)
        {
            var h = ws.Cell(headerRow, c + 1);
            h.Value = Safe(t.Headers[c]);
            h.Style.Font.Bold = true;
            h.Style.Fill.BackgroundColor = XLColor.LightGray;
        }

        var r = headerRow + 1;
        foreach (var row in t.Rows)
        {
            for (var c = 0; c < t.Headers.Count; c++)
            {
                var text = c < row.Count ? row[c] : string.Empty;
                var cell = ws.Cell(r, c + 1);
                if (t.NumericColumns.Contains(c) && decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var n))
                    cell.Value = n;
                else
                    cell.Value = Safe(text);
            }
            r++;
        }
        foreach (var line in t.Footer)
        {
            r++;
            ws.Cell(r, 1).Value = Safe(line);
            ws.Cell(r, 1).Style.Font.Bold = true;
        }

        ws.SheetView.FreezeRows(headerRow);
        ws.Columns().AdjustToContents(1, 60);
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // Spreadsheet formula injection: a text cell that starts with = + - @ (or a control character) can be
    // interpreted as a formula when the file is re-saved or exported. Neutralise it with a leading quote.
    internal static string Safe(string value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        var first = value[0];
        var risky = first is '=' or '@' or '\t' or '\r' or '\n' || ((first is '+' or '-') && !decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out _));
        return risky ? "'" + value : value;
    }
}
