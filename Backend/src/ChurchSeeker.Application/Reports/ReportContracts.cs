using ChurchSeeker.Application.Common;

namespace ChurchSeeker.Application.Reports;

public enum ReportKind { Members = 1, Attendance = 2, Ministries = 3, Income = 4 }
public enum ReportFormat { Pdf = 1, Xlsx = 2 }

// A report is just a titled table, so every exporter can render every report (Open/Closed).
public record ReportTable(string Title, string Subtitle, IReadOnlyList<string> Headers,
                          IReadOnlyList<IReadOnlyList<string>> Rows, IReadOnlyList<string> Footer,
                          IReadOnlyList<int> NumericColumns);

public record ReportQuery(bool? Active = null, DateOnly? From = null, DateOnly? To = null, Guid? EventId = null);

public record ExportedReport(byte[] Bytes, string ContentType, string FileName);

public interface IReportExporter
{
    ReportFormat Format { get; }
    string ContentType { get; }
    string Extension { get; }
    byte[] Export(ReportTable table);
}

public interface IReportService
{
    Task<Result<ReportTable>> BuildAsync(ReportKind kind, ReportQuery query, CancellationToken ct = default);
}

public interface IReportExportService
{
    Task<Result<ExportedReport>> ExportAsync(ReportKind kind, ReportFormat format, ReportQuery query, CancellationToken ct = default);
}
