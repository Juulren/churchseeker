using ChurchSeeker.Application.Attendance;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Dashboard;
using ChurchSeeker.Application.Donations;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class DashboardService : IDashboardService
{
    private readonly IRepository<Member> _members;
    private readonly IRepository<ChurchEvent> _events;
    private readonly IRepository<Attendance> _attendance;
    private readonly IRepository<Ministry> _ministries;
    private readonly IAttendanceService _attendanceService;
    private readonly IDonationService _donations;
    private readonly ICurrentUser _current;
    private readonly TimeProvider _clock;

    public DashboardService(IRepository<Member> members, IRepository<ChurchEvent> events, IRepository<Attendance> attendance,
                            IRepository<Ministry> ministries, IAttendanceService attendanceService, IDonationService donations,
                            ICurrentUser current, TimeProvider clock)
    {
        _members = members; _events = events; _attendance = attendance; _ministries = ministries;
        _attendanceService = attendanceService; _donations = donations; _current = current; _clock = clock;
    }

    public async Task<Result<DashboardResponse>> GetAsync(CancellationToken ct = default)
    {
        if (_current.ChurchId is null || _current.Role is null) return Result<DashboardResponse>.Fail(ErrorKind.Forbidden);

        var today = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);
        var monthStart = new DateOnly(today.Year, today.Month, 1);

        var kpis = new DashboardKpis(
            await _members.Query().AsNoTracking().CountAsync(m => m.IsActive, ct),
            await _events.Query().AsNoTracking().CountAsync(e => !e.IsCancelled && e.Date >= today && e.Date <= today.AddDays(30), ct),
            await (from a in _attendance.Query().AsNoTracking()
                   join e in _events.Query().AsNoTracking() on a.EventId equals e.Id
                   where a.Present && e.Date >= monthStart && e.Date <= today
                   select a.Id).CountAsync(ct),
            await _ministries.Query().AsNoTracking().CountAsync(m => m.IsActive, ct));

        var weeks = await _attendanceService.SummaryAsync(today.AddDays(-55), today, SummaryPeriod.Week, ct);

        // Decided here, from the verified role, before any income query runs.
        IncomeSummary? income = null;
        if (_current.Role is UserRole.Tesorero or UserRole.Administrador)
        {
            var monthly = await _donations.MonthlySummaryAsync(today.Year, ct);
            var rows = monthly.Value ?? [];
            income = new IncomeSummary(today.Year,
                rows.FirstOrDefault(r => r.Month == today.Month)?.Total ?? 0m,
                rows.Sum(r => r.Total),
                rows);
        }

        return Result<DashboardResponse>.Ok(new DashboardResponse(kpis, weeks.Value ?? [], income));
    }
}
