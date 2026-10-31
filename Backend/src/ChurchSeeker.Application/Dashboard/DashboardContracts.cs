using System.Text.Json.Serialization;
using ChurchSeeker.Application.Attendance;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Donations;

namespace ChurchSeeker.Application.Dashboard;

public record DashboardKpis(int ActiveMembers, int UpcomingEvents, int AttendancesThisMonth, int ActiveMinistries);

public record IncomeSummary(int Year, decimal MonthToDate, decimal YearToDate, IReadOnlyList<MonthlyIncomeRow> Monthly);

// Income is null (and left out of the JSON entirely) unless the caller is a finance role:
// the figure is never computed or serialised for anybody else.
public record DashboardResponse(
    DashboardKpis Kpis,
    IReadOnlyList<AttendanceSummaryRow> AttendanceByWeek,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IncomeSummary? Income);

public interface IDashboardService
{
    Task<Result<DashboardResponse>> GetAsync(CancellationToken ct = default);
}
