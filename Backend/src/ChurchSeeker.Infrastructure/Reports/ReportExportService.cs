using ChurchSeeker.Application.Auditing;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Reports;

namespace ChurchSeeker.Infrastructure.Reports;

public sealed class ReportExportService : IReportExportService
{
    private readonly IReportService _reports;
    private readonly IEnumerable<IReportExporter> _exporters;
    private readonly IAuditLogger _audit;
    private readonly TimeProvider _clock;

    public ReportExportService(IReportService reports, IEnumerable<IReportExporter> exporters, IAuditLogger audit, TimeProvider clock)
    {
        _reports = reports; _exporters = exporters; _audit = audit; _clock = clock;
    }

    public async Task<Result<ExportedReport>> ExportAsync(ReportKind kind, ReportFormat format, ReportQuery query, CancellationToken ct = default)
    {
        var exporter = _exporters.FirstOrDefault(e => e.Format == format);
        if (exporter is null || !Enum.IsDefined(kind)) return Result<ExportedReport>.Fail(ErrorKind.Validation, "Unsupported report or format.");

        var table = await _reports.BuildAsync(kind, query, ct);
        if (!table.Succeeded) return Result<ExportedReport>.Fail(table.Error, table.Messages.ToArray());

        var bytes = exporter.Export(table.Value!);
        // Who exported what, never the data itself.
        await _audit.WriteAsync(new AuditEntry("report.exported", Details: $"kind={kind};format={format}"), ct);
        var name = $"reporte-{kind.ToString().ToLowerInvariant()}-{_clock.GetUtcNow():yyyyMMdd}.{exporter.Extension}";
        return Result<ExportedReport>.Ok(new ExportedReport(bytes, exporter.ContentType, name));
    }
}
