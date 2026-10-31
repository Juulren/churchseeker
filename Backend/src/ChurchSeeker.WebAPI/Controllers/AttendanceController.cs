using ChurchSeeker.Application.Attendance;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

[Authorize(Policy = Policies.Management)]
public class AttendanceController : ApiControllerBase
{
    private readonly IAttendanceService _attendance;

    public AttendanceController(IAttendanceService attendance) => _attendance = attendance;

    [HttpPut("api/events/{eventId:guid}/attendance")]
    public async Task<IActionResult> Record(Guid eventId, RecordAttendanceRequest request, CancellationToken ct) =>
        Map(await _attendance.RecordAsync(eventId, request, ct));

    [HttpGet("api/events/{eventId:guid}/attendance")]
    public async Task<IActionResult> ForEvent(Guid eventId, CancellationToken ct) =>
        Map(await _attendance.GetForEventAsync(eventId, ct));

    [HttpGet("api/members/{memberId:guid}/attendance")]
    public async Task<IActionResult> History(Guid memberId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        Map(await _attendance.HistoryForMemberAsync(memberId, page, pageSize, ct));

    [HttpGet("api/attendance/summary")]
    public async Task<IActionResult> Summary([FromQuery] DateOnly from, [FromQuery] DateOnly to,
        [FromQuery] SummaryPeriod period = SummaryPeriod.Week, CancellationToken ct = default) =>
        Map(await _attendance.SummaryAsync(from, to, period, ct));
}
