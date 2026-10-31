using ChurchSeeker.Application.Reports;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ChurchSeeker.WebAPI.Controllers;

// Exports are rate limited. Income is Finance only; the other reports are Management only.
[Route("api/reports")]
[Authorize]
[EnableRateLimiting(RateLimitPolicies.Reports)]
public class ReportsController : ApiControllerBase
{
    private readonly IReportExportService _export;

    public ReportsController(IReportExportService export) => _export = export;

    [HttpGet("members")]
    [Authorize(Policy = Policies.Management)]
    public Task<IActionResult> Members([FromQuery] ReportFormat format = ReportFormat.Pdf, [FromQuery] bool? active = null, CancellationToken ct = default) =>
        Run(ReportKind.Members, format, new ReportQuery(Active: active), ct);

    [HttpGet("attendance")]
    [Authorize(Policy = Policies.Management)]
    public Task<IActionResult> Attendance([FromQuery] ReportFormat format = ReportFormat.Pdf, [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null, [FromQuery] Guid? eventId = null, CancellationToken ct = default) =>
        Run(ReportKind.Attendance, format, new ReportQuery(From: from, To: to, EventId: eventId), ct);

    [HttpGet("ministries")]
    [Authorize(Policy = Policies.Management)]
    public Task<IActionResult> Ministries([FromQuery] ReportFormat format = ReportFormat.Pdf, CancellationToken ct = default) =>
        Run(ReportKind.Ministries, format, new ReportQuery(), ct);

    [HttpGet("income")]
    [Authorize(Policy = Policies.Finance)]
    public Task<IActionResult> Income([FromQuery] ReportFormat format = ReportFormat.Pdf, [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null, CancellationToken ct = default) =>
        Run(ReportKind.Income, format, new ReportQuery(From: from, To: to), ct);

    private async Task<IActionResult> Run(ReportKind kind, ReportFormat format, ReportQuery query, CancellationToken ct)
    {
        if (!Enum.IsDefined(format)) return BadRequest(new { errors = new[] { "Unsupported format. Use Pdf or Xlsx." } });
        return Map(await _export.ExportAsync(kind, format, query, ct), r => File(r.Bytes, r.ContentType, r.FileName));
    }
}
