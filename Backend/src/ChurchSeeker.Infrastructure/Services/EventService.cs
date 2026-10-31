using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Events;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Exceptions;
using ChurchSeeker.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class EventService : IEventService, IPublicEventService
{
    private const int MaxPublicRangeDays = 366;
    private const int MaxPublicResults = 500;

    private readonly IRepository<ChurchEvent> _events;
    private readonly IRepository<Member> _members;
    private readonly IRepository<Church> _churches;
    private readonly ICurrentUser _current;
    private readonly PublicTenantScope _publicScope;
    private readonly TimeProvider _clock;

    public EventService(IRepository<ChurchEvent> events, IRepository<Member> members, IRepository<Church> churches,
                        ICurrentUser current, PublicTenantScope publicScope, TimeProvider clock)
    {
        _events = events; _members = members; _churches = churches;
        _current = current; _publicScope = publicScope; _clock = clock;
    }

    private DateOnly Today => DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);

    public async Task<Result<PagedResult<EventResponse>>> ListAsync(EventQuery q, CancellationToken ct = default)
    {
        if (q.From is { } f && q.To is { } t && f > t)
            return Result<PagedResult<EventResponse>>.Fail(ErrorKind.Validation, "From must not be after To.");

        var page = Math.Max(1, q.Page);
        var size = Math.Clamp(q.PageSize, 1, 200);
        var query = _events.Query().AsNoTracking();
        if (q.From is { } from) query = query.Where(e => e.Date >= from);
        if (q.To is { } to) query = query.Where(e => e.Date <= to);

        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(e => e.Date).ThenBy(e => e.Time).ThenBy(e => e.Id)
            .Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return Result<PagedResult<EventResponse>>.Ok(new PagedResult<EventResponse>(items.Select(ToResponse).ToList(), page, size, total));
    }

    public async Task<Result<EventResponse>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await _events.GetByIdAsync(id, ct);
        return e is null ? Result<EventResponse>.Fail(ErrorKind.NotFound) : Result<EventResponse>.Ok(ToResponse(e));
    }

    public async Task<Result<EventResponse>> CreateAsync(EventRequest r, CancellationToken ct = default)
    {
        if (_current.ChurchId is not { } churchId) return Result<EventResponse>.Fail(ErrorKind.Forbidden);
        var check = await CheckResponsibleAsync(r.ResponsibleMemberId, ct);
        if (check is not null) return check;
        try
        {
            var e = new ChurchEvent(churchId, r.Title, r.Description, r.Date, r.Time, r.Location, r.Kind, r.IsPublic, r.ResponsibleMemberId);
            await _events.AddAsync(e, ct);
            await _events.SaveChangesAsync(ct);
            return Result<EventResponse>.Ok(ToResponse(e));
        }
        catch (DomainException ex) { return Result<EventResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<EventResponse>> UpdateAsync(Guid id, EventRequest r, CancellationToken ct = default)
    {
        var e = await _events.GetByIdAsync(id, ct);
        if (e is null) return Result<EventResponse>.Fail(ErrorKind.NotFound);
        var check = await CheckResponsibleAsync(r.ResponsibleMemberId, ct);
        if (check is not null) return check;
        try
        {
            e.Update(r.Title, r.Description, r.Date, r.Time, r.Location, r.Kind, r.IsPublic, r.ResponsibleMemberId);
            await _events.SaveChangesAsync(ct);
            return Result<EventResponse>.Ok(ToResponse(e));
        }
        catch (DomainException ex) { return Result<EventResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<EventResponse>> SetCancelledAsync(Guid id, bool cancelled, CancellationToken ct = default)
    {
        var e = await _events.GetByIdAsync(id, ct);
        if (e is null) return Result<EventResponse>.Fail(ErrorKind.NotFound);
        if (cancelled) e.Cancel(); else e.Restore();
        await _events.SaveChangesAsync(ct);
        return Result<EventResponse>.Ok(ToResponse(e));
    }

    public async Task<Result<IReadOnlyList<PublicEventResponse>>> ListAsync(Guid churchId, DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var start = from ?? Today;
        var end = to ?? start.AddDays(90);
        if (end < start || end.DayNumber - start.DayNumber > MaxPublicRangeDays)
            return Result<IReadOnlyList<PublicEventResponse>>.Fail(ErrorKind.Validation, "Invalid date range (max 366 days).");

        if (!await _churches.Query().AsNoTracking().AnyAsync(c => c.Id == churchId && c.IsActive, ct))
            return Result<IReadOnlyList<PublicEventResponse>>.Fail(ErrorKind.NotFound);

        _publicScope.Use(churchId);
        var items = await _events.Query().AsNoTracking()
            .Where(e => e.IsPublic && e.Date >= start && e.Date <= end)
            .OrderBy(e => e.Date).ThenBy(e => e.Time).ThenBy(e => e.Id)
            .Take(MaxPublicResults).ToListAsync(ct);
        return Result<IReadOnlyList<PublicEventResponse>>.Ok(
            items.Select(e => new PublicEventResponse(e.Id, e.Title, e.Description, e.Date, e.Time, e.Location, e.Kind, e.IsCancelled)).ToList());
    }

    // The responsible person must be an active member of the SAME church (tenant filter enforces it).
    private async Task<Result<EventResponse>?> CheckResponsibleAsync(Guid? memberId, CancellationToken ct)
    {
        if (memberId is null) return null;
        var ok = await _members.Query().AsNoTracking().AnyAsync(m => m.Id == memberId && m.IsActive, ct);
        return ok ? null : Result<EventResponse>.Fail(ErrorKind.Validation, "ResponsibleMemberId does not match an active member.");
    }

    private static EventResponse ToResponse(ChurchEvent e) =>
        new(e.Id, e.Title, e.Description, e.Date, e.Time, e.Location, e.Kind, e.IsPublic, e.ResponsibleMemberId, e.IsCancelled);
}
