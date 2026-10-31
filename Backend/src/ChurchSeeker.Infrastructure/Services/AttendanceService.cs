using ChurchSeeker.Application.Attendance;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class AttendanceService : IAttendanceService
{
    private const int MaxEntries = 1000;
    private const int MaxSummaryDays = 366;
    private const int MaxRetries = 4;

    private readonly IRepository<Attendance> _attendance;
    private readonly IRepository<ChurchEvent> _events;
    private readonly IRepository<Member> _members;
    private readonly ICurrentUser _current;
    private readonly TimeProvider _clock;
    private readonly Persistence.AppDbContext _db;

    public AttendanceService(IRepository<Attendance> attendance, IRepository<ChurchEvent> events, IRepository<Member> members,
                             ICurrentUser current, TimeProvider clock, Persistence.AppDbContext db)
    {
        _attendance = attendance; _events = events; _members = members; _current = current; _clock = clock; _db = db;
    }

    private DateOnly Today => DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);

    public async Task<Result<EventAttendanceResponse>> RecordAsync(Guid eventId, RecordAttendanceRequest request, CancellationToken ct = default)
    {
        if (_current.ChurchId is not { } churchId) return Result<EventAttendanceResponse>.Fail(ErrorKind.Forbidden);
        var entries = request?.Entries;
        if (entries is null || entries.Count == 0 || entries.Count > MaxEntries)
            return Result<EventAttendanceResponse>.Fail(ErrorKind.Validation, $"Entries must contain 1 to {MaxEntries} items.");
        if (entries.Select(e => e.MemberId).Distinct().Count() != entries.Count)
            return Result<EventAttendanceResponse>.Fail(ErrorKind.Validation, "Duplicate members in the same request.");

        var ev = await _events.Query().AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return Result<EventAttendanceResponse>.Fail(ErrorKind.NotFound);
        if (ev.IsCancelled) return Result<EventAttendanceResponse>.Fail(ErrorKind.Validation, "The event is cancelled.");
        if (ev.Date > Today) return Result<EventAttendanceResponse>.Fail(ErrorKind.Validation, "Attendance cannot be recorded for a future event.");

        var ids = entries.Select(e => e.MemberId).ToList();
        var valid = await _members.Query().AsNoTracking().Where(m => ids.Contains(m.Id) && m.IsActive).Select(m => m.Id).ToListAsync(ct);
        if (valid.Count != ids.Count)
            return Result<EventAttendanceResponse>.Fail(ErrorKind.Validation, "Some members do not exist or are inactive.");

        // Upsert. A concurrent request may insert the same (event, member) first; the unique index then
        // rejects ours, so reload and retry instead of creating a duplicate or failing.
        for (var attempt = 0; attempt < MaxRetries; attempt++)
        {
            var existing = await _attendance.Query().Where(a => a.EventId == eventId && ids.Contains(a.MemberId)).ToListAsync(ct);
            foreach (var entry in entries)
            {
                var row = existing.FirstOrDefault(a => a.MemberId == entry.MemberId);
                if (row is null) await _attendance.AddAsync(new Attendance(churchId, eventId, entry.MemberId, entry.Present), ct);
                else if (row.Present != entry.Present) row.Mark(entry.Present);
            }
            try
            {
                await _attendance.SaveChangesAsync(ct);
                return await GetForEventAsync(eventId, ct);
            }
            catch (DbUpdateException)
            {
                _db.ChangeTracker.Clear();
                await Task.Delay(Random.Shared.Next(1, 20), ct);
            }
        }
        return Result<EventAttendanceResponse>.Fail(ErrorKind.Conflict, "Could not record attendance, try again.");
    }

    public async Task<Result<EventAttendanceResponse>> GetForEventAsync(Guid eventId, CancellationToken ct = default)
    {
        var ev = await _events.Query().AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return Result<EventAttendanceResponse>.Fail(ErrorKind.NotFound);

        var rows = await (from a in _attendance.Query().AsNoTracking()
                          where a.EventId == eventId
                          join m in _members.Query().AsNoTracking() on a.MemberId equals m.Id
                          orderby m.FullName, m.Id
                          select new AttendanceRow(m.Id, m.FullName, a.Present)).ToListAsync(ct);
        return Result<EventAttendanceResponse>.Ok(new EventAttendanceResponse(
            ev.Id, ev.Title, ev.Date, rows.Count(r => r.Present), rows.Count(r => !r.Present), rows));
    }

    public async Task<Result<PagedResult<MemberAttendanceRow>>> HistoryForMemberAsync(Guid memberId, int page, int pageSize, CancellationToken ct = default)
    {
        if (!await _members.Query().AsNoTracking().AnyAsync(m => m.Id == memberId, ct))
            return Result<PagedResult<MemberAttendanceRow>>.Fail(ErrorKind.NotFound);

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = from a in _attendance.Query().AsNoTracking()
                    where a.MemberId == memberId
                    join e in _events.Query().AsNoTracking() on a.EventId equals e.Id
                    select new { e.Id, e.Title, e.Date, e.Time, a.Present };
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.Date).ThenByDescending(x => x.Time).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return Result<PagedResult<MemberAttendanceRow>>.Ok(new PagedResult<MemberAttendanceRow>(
            rows.Select(x => new MemberAttendanceRow(x.Id, x.Title, x.Date, x.Present)).ToList(), page, pageSize, total));
    }

    public async Task<Result<IReadOnlyList<AttendanceSummaryRow>>> SummaryAsync(DateOnly rangeStart, DateOnly rangeEnd, SummaryPeriod period, CancellationToken ct = default)
    {
        if (!Enum.IsDefined(period) || rangeEnd < rangeStart || rangeEnd.DayNumber - rangeStart.DayNumber > MaxSummaryDays)
            return Result<IReadOnlyList<AttendanceSummaryRow>>.Fail(ErrorKind.Validation, "Invalid range (max 366 days) or period.");

        var today = Today;
        var events = await _events.Query().AsNoTracking()
            .Where(e => !e.IsCancelled && e.Date >= rangeStart && e.Date <= rangeEnd && e.Date <= today)
            .Select(e => new { e.Id, e.Date }).ToListAsync(ct);
        var marks = await (from a in _attendance.Query().AsNoTracking()
                           join e in _events.Query().AsNoTracking() on a.EventId equals e.Id
                           where !e.IsCancelled && e.Date >= rangeStart && e.Date <= rangeEnd && e.Date <= today
                           select new { e.Date, a.MemberId, a.Present }).ToListAsync(ct);

        static DateOnly Key(DateOnly d, SummaryPeriod p) => p == SummaryPeriod.Month
            ? new DateOnly(d.Year, d.Month, 1)
            : d.AddDays(-(((int)d.DayOfWeek + 6) % 7)); // Monday as week start

        var rows = events.GroupBy(e => Key(e.Date, period)).Select(g =>
        {
            var m = marks.Where(x => Key(x.Date, period) == g.Key).ToList();
            return new AttendanceSummaryRow(g.Key, g.Count(), m.Count(x => x.Present), m.Count(x => !x.Present),
                m.Where(x => x.Present).Select(x => x.MemberId).Distinct().Count());
        }).OrderBy(r => r.PeriodStart).ToList();
        return Result<IReadOnlyList<AttendanceSummaryRow>>.Ok(rows);
    }
}

