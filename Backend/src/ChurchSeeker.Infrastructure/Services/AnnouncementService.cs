using ChurchSeeker.Application.Announcements;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Events;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Exceptions;
using ChurchSeeker.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class AnnouncementService : IAnnouncementService, IPublicAnnouncementService
{
    private const int MaxPublic = 100;
    private readonly IRepository<Announcement> _repo;
    private readonly IRepository<Church> _churches;
    private readonly IPublicEventService _events;
    private readonly ICurrentUser _current;
    private readonly PublicTenantScope _publicScope;
    private readonly TimeProvider _clock;

    public AnnouncementService(IRepository<Announcement> repo, IRepository<Church> churches, IPublicEventService events,
                               ICurrentUser current, PublicTenantScope publicScope, TimeProvider clock)
    {
        _repo = repo; _churches = churches; _events = events; _current = current; _publicScope = publicScope; _clock = clock;
    }

    private DateOnly Today => DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);

    public async Task<Result<PagedResult<AnnouncementResponse>>> ListAsync(bool includeInactive, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = _repo.Query().AsNoTracking();
        if (!includeInactive) query = query.Where(a => a.IsActive);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(a => a.PublishDate).ThenBy(a => a.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return Result<PagedResult<AnnouncementResponse>>.Ok(new PagedResult<AnnouncementResponse>(items.Select(ToResponse).ToList(), page, pageSize, total));
    }

    public async Task<Result<AnnouncementResponse>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var a = await _repo.GetByIdAsync(id, ct);
        return a is null ? Result<AnnouncementResponse>.Fail(ErrorKind.NotFound) : Result<AnnouncementResponse>.Ok(ToResponse(a));
    }

    public async Task<Result<AnnouncementResponse>> CreateAsync(AnnouncementRequest r, CancellationToken ct = default)
    {
        if (_current.ChurchId is not { } churchId) return Result<AnnouncementResponse>.Fail(ErrorKind.Forbidden);
        try
        {
            var a = new Announcement(churchId, r.Title, r.Body, r.PublishDate, r.ExpiresOn, r.IsImportant, r.IsPublic);
            await _repo.AddAsync(a, ct);
            await _repo.SaveChangesAsync(ct);
            return Result<AnnouncementResponse>.Ok(ToResponse(a));
        }
        catch (DomainException ex) { return Result<AnnouncementResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<AnnouncementResponse>> UpdateAsync(Guid id, AnnouncementRequest r, CancellationToken ct = default)
    {
        var a = await _repo.GetByIdAsync(id, ct);
        if (a is null) return Result<AnnouncementResponse>.Fail(ErrorKind.NotFound);
        try
        {
            a.Update(r.Title, r.Body, r.PublishDate, r.ExpiresOn, r.IsImportant, r.IsPublic);
            await _repo.SaveChangesAsync(ct);
            return Result<AnnouncementResponse>.Ok(ToResponse(a));
        }
        catch (DomainException ex) { return Result<AnnouncementResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<AnnouncementResponse>> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var a = await _repo.GetByIdAsync(id, ct);
        if (a is null) return Result<AnnouncementResponse>.Fail(ErrorKind.NotFound);
        if (a.IsActive)
        {
            a.Deactivate();
            await _repo.SaveChangesAsync(ct);
        }
        return Result<AnnouncementResponse>.Ok(ToResponse(a));
    }

    public async Task<Result<IReadOnlyList<PublicAnnouncementResponse>>> ListAsync(Guid churchId, bool importantOnly, CancellationToken ct = default)
    {
        if (!await UsePublicScopeAsync(churchId, ct))
            return Result<IReadOnlyList<PublicAnnouncementResponse>>.Fail(ErrorKind.NotFound);
        return Result<IReadOnlyList<PublicAnnouncementResponse>>.Ok(await VisibleAsync(importantOnly, MaxPublic, ct));
    }

    public async Task<Result<PublicHighlights>> HighlightsAsync(Guid churchId, CancellationToken ct = default)
    {
        if (!await UsePublicScopeAsync(churchId, ct)) return Result<PublicHighlights>.Fail(ErrorKind.NotFound);
        var important = await VisibleAsync(true, 5, ct);
        var events = await _events.ListAsync(churchId, Today, Today.AddDays(60), ct);
        var upcoming = events.Succeeded ? events.Value!.Where(e => !e.IsCancelled).Take(5).ToList() : [];
        return Result<PublicHighlights>.Ok(new PublicHighlights(important, upcoming));
    }

    private async Task<bool> UsePublicScopeAsync(Guid churchId, CancellationToken ct)
    {
        if (!await _churches.Query().AsNoTracking().AnyAsync(c => c.Id == churchId && c.IsActive, ct)) return false;
        _publicScope.Use(churchId);
        return true;
    }

    private async Task<IReadOnlyList<PublicAnnouncementResponse>> VisibleAsync(bool importantOnly, int take, CancellationToken ct)
    {
        var today = Today;
        var query = _repo.Query().AsNoTracking()
            .Where(a => a.IsActive && a.IsPublic && a.PublishDate <= today && (a.ExpiresOn == null || a.ExpiresOn >= today));
        if (importantOnly) query = query.Where(a => a.IsImportant);
        var rows = await query.OrderByDescending(a => a.IsImportant).ThenByDescending(a => a.PublishDate).ThenBy(a => a.Id)
            .Take(take).ToListAsync(ct);
        return rows.Select(a => new PublicAnnouncementResponse(a.Id, a.Title, a.Body, a.PublishDate, a.ExpiresOn, a.IsImportant)).ToList();
    }

    private static AnnouncementResponse ToResponse(Announcement a) =>
        new(a.Id, a.Title, a.Body, a.PublishDate, a.ExpiresOn, a.IsImportant, a.IsPublic, a.IsActive);
}
