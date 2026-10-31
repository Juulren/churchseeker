using ChurchSeeker.Application.Common;

namespace ChurchSeeker.Application.Attendance;

public record AttendanceEntry(Guid MemberId, bool Present);
public record RecordAttendanceRequest(IReadOnlyList<AttendanceEntry> Entries);

public record AttendanceRow(Guid MemberId, string MemberName, bool Present);
public record EventAttendanceResponse(Guid EventId, string Title, DateOnly Date, int Present, int Absent, IReadOnlyList<AttendanceRow> Rows);
public record MemberAttendanceRow(Guid EventId, string Title, DateOnly Date, bool Present);

public enum SummaryPeriod { Week = 1, Month = 2 }
public record AttendanceSummaryRow(DateOnly PeriodStart, int Events, int Present, int Absent, int DistinctMembersPresent);

public interface IAttendanceService
{
    Task<Result<EventAttendanceResponse>> RecordAsync(Guid eventId, RecordAttendanceRequest request, CancellationToken ct = default);
    Task<Result<EventAttendanceResponse>> GetForEventAsync(Guid eventId, CancellationToken ct = default);
    Task<Result<PagedResult<MemberAttendanceRow>>> HistoryForMemberAsync(Guid memberId, int page, int pageSize, CancellationToken ct = default);
    Task<Result<IReadOnlyList<AttendanceSummaryRow>>> SummaryAsync(DateOnly from, DateOnly to, SummaryPeriod period, CancellationToken ct = default);
}
