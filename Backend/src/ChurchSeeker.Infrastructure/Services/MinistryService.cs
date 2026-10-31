using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Events;
using ChurchSeeker.Application.Ministries;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Domain.Exceptions;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class MinistryService : IMinistryService
{
    private readonly IRepository<Ministry> _ministries;
    private readonly IRepository<MinistryMember> _links;
    private readonly IRepository<Member> _members;
    private readonly IRepository<ChurchEvent> _events;
    private readonly UserManager<ApplicationUser> _users;
    private readonly ICurrentUser _current;
    private readonly TimeProvider _clock;
    private readonly AppDbContext _db;

    public MinistryService(IRepository<Ministry> ministries, IRepository<MinistryMember> links, IRepository<Member> members,
                           IRepository<ChurchEvent> events, UserManager<ApplicationUser> users, ICurrentUser current,
                           TimeProvider clock, AppDbContext db)
    {
        _ministries = ministries; _links = links; _members = members; _events = events;
        _users = users; _current = current; _clock = clock; _db = db;
    }

    private bool IsCoordinatorRole => _current.Role == UserRole.Coordinador;
    private DateOnly Today => DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);

    // Coordinators only see ministries they coordinate; everything else looks like 404 to them.
    private bool Visible(Ministry m) => !IsCoordinatorRole || (_current.UserId is { } uid && m.CoordinatorUserId == uid);

    // Management may change any ministry; a coordinator may change the membership of their own.
    private bool CanManageMembers(Ministry m) =>
        _current.Role is UserRole.Administrador or UserRole.Pastor or UserRole.Secretario || (IsCoordinatorRole && Visible(m));

    private bool IsManagement => _current.Role is UserRole.Administrador or UserRole.Pastor or UserRole.Secretario;

    public async Task<Result<IReadOnlyList<MinistryResponse>>> ListAsync(CancellationToken ct = default)
    {
        var query = _ministries.Query().AsNoTracking();
        if (IsCoordinatorRole)
        {
            var uid = _current.UserId;
            query = query.Where(m => m.CoordinatorUserId == uid);
        }
        var rows = await query.OrderBy(m => m.Name).Take(200)
            .Select(m => new { m, Count = _links.Query().Count(l => l.MinistryId == m.Id && l.IsActive) }).ToListAsync(ct);
        return Result<IReadOnlyList<MinistryResponse>>.Ok(rows.Select(r => ToResponse(r.m, r.Count)).ToList());
    }

    public async Task<Result<MinistryResponse>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var m = await _ministries.GetByIdAsync(id, ct);
        if (m is null || !Visible(m)) return Result<MinistryResponse>.Fail(ErrorKind.NotFound);
        return Result<MinistryResponse>.Ok(ToResponse(m, await CountAsync(id, ct)));
    }

    public async Task<Result<MinistryResponse>> CreateAsync(MinistryRequest r, CancellationToken ct = default)
    {
        if (!IsManagement || _current.ChurchId is not { } churchId) return Result<MinistryResponse>.Fail(ErrorKind.Forbidden);
        var coord = await CheckCoordinatorAsync(r.CoordinatorUserId, churchId);
        if (coord is not null) return Result<MinistryResponse>.Fail(ErrorKind.Validation, coord);
        try
        {
            var m = new Ministry(churchId, r.Name, r.Description, r.CoordinatorUserId);
            if (await NameTakenAsync(m.Name, null, ct)) return Result<MinistryResponse>.Fail(ErrorKind.Conflict, "A ministry with that name already exists.");
            await _ministries.AddAsync(m, ct);
            return await SaveAsync(m, ct);
        }
        catch (DomainException ex) { return Result<MinistryResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<MinistryResponse>> UpdateAsync(Guid id, MinistryRequest r, CancellationToken ct = default)
    {
        if (!IsManagement || _current.ChurchId is not { } churchId) return Result<MinistryResponse>.Fail(ErrorKind.Forbidden);
        var m = await _ministries.GetByIdAsync(id, ct);
        if (m is null) return Result<MinistryResponse>.Fail(ErrorKind.NotFound);
        var coord = await CheckCoordinatorAsync(r.CoordinatorUserId, churchId);
        if (coord is not null) return Result<MinistryResponse>.Fail(ErrorKind.Validation, coord);
        try
        {
            m.Update(r.Name, r.Description, r.CoordinatorUserId);
            if (await NameTakenAsync(m.Name, id, ct)) { _db.ChangeTracker.Clear(); return Result<MinistryResponse>.Fail(ErrorKind.Conflict, "A ministry with that name already exists."); }
            return await SaveAsync(m, ct);
        }
        catch (DomainException ex) { return Result<MinistryResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<MinistryResponse>> SetActiveAsync(Guid id, bool active, CancellationToken ct = default)
    {
        if (!IsManagement) return Result<MinistryResponse>.Fail(ErrorKind.Forbidden);
        var m = await _ministries.GetByIdAsync(id, ct);
        if (m is null) return Result<MinistryResponse>.Fail(ErrorKind.NotFound);
        if (active) m.Activate(); else m.Deactivate();
        return await SaveAsync(m, ct);
    }

    public async Task<Result<IReadOnlyList<MinistryMemberResponse>>> MembersAsync(Guid id, CancellationToken ct = default)
    {
        var m = await _ministries.GetByIdAsync(id, ct);
        if (m is null || !Visible(m)) return Result<IReadOnlyList<MinistryMemberResponse>>.Fail(ErrorKind.NotFound);
        return Result<IReadOnlyList<MinistryMemberResponse>>.Ok(await ListMembersAsync(id, ct));
    }

    public async Task<Result<IReadOnlyList<MinistryMemberResponse>>> AddMemberAsync(Guid id, Guid memberId, CancellationToken ct = default)
    {
        var m = await _ministries.GetByIdAsync(id, ct);
        if (m is null || !Visible(m)) return Result<IReadOnlyList<MinistryMemberResponse>>.Fail(ErrorKind.NotFound);
        if (!CanManageMembers(m) || _current.ChurchId is not { } churchId) return Result<IReadOnlyList<MinistryMemberResponse>>.Fail(ErrorKind.Forbidden);
        if (!m.IsActive) return Result<IReadOnlyList<MinistryMemberResponse>>.Fail(ErrorKind.Validation, "The ministry is inactive.");
        if (!await _members.Query().AsNoTracking().AnyAsync(x => x.Id == memberId && x.IsActive, ct))
            return Result<IReadOnlyList<MinistryMemberResponse>>.Fail(ErrorKind.Validation, "Member does not exist or is inactive.");

        for (var attempt = 0; attempt < 3; attempt++)
        {
            var link = await _links.Query().FirstOrDefaultAsync(l => l.MinistryId == id && l.MemberId == memberId, ct);
            if (link is null) await _links.AddAsync(new MinistryMember(churchId, id, memberId), ct);
            else if (!link.IsActive) link.Activate();
            else return Result<IReadOnlyList<MinistryMemberResponse>>.Ok(await ListMembersAsync(id, ct));
            try
            {
                await _links.SaveChangesAsync(ct);
                break;
            }
            catch (DbUpdateException) { _db.ChangeTracker.Clear(); }
        }
        return Result<IReadOnlyList<MinistryMemberResponse>>.Ok(await ListMembersAsync(id, ct));
    }

    public async Task<Result<IReadOnlyList<MinistryMemberResponse>>> RemoveMemberAsync(Guid id, Guid memberId, CancellationToken ct = default)
    {
        var m = await _ministries.GetByIdAsync(id, ct);
        if (m is null || !Visible(m)) return Result<IReadOnlyList<MinistryMemberResponse>>.Fail(ErrorKind.NotFound);
        if (!CanManageMembers(m)) return Result<IReadOnlyList<MinistryMemberResponse>>.Fail(ErrorKind.Forbidden);
        var link = await _links.Query().FirstOrDefaultAsync(l => l.MinistryId == id && l.MemberId == memberId && l.IsActive, ct);
        if (link is null) return Result<IReadOnlyList<MinistryMemberResponse>>.Fail(ErrorKind.NotFound);
        link.Deactivate();
        await _links.SaveChangesAsync(ct);
        return Result<IReadOnlyList<MinistryMemberResponse>>.Ok(await ListMembersAsync(id, ct));
    }

    public async Task<Result<IReadOnlyList<EventResponse>>> EventsAsync(Guid id, DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var m = await _ministries.GetByIdAsync(id, ct);
        if (m is null || !Visible(m)) return Result<IReadOnlyList<EventResponse>>.Fail(ErrorKind.NotFound);
        var start = from ?? Today;
        var end = to ?? start.AddDays(180);
        if (end < start || end.DayNumber - start.DayNumber > 366)
            return Result<IReadOnlyList<EventResponse>>.Fail(ErrorKind.Validation, "Invalid date range (max 366 days).");
        var rows = await _events.Query().AsNoTracking()
            .Where(e => e.MinistryId == id && e.Date >= start && e.Date <= end)
            .OrderBy(e => e.Date).ThenBy(e => e.Time).ThenBy(e => e.Id).Take(500).ToListAsync(ct);
        return Result<IReadOnlyList<EventResponse>>.Ok(rows.Select(e => new EventResponse(
            e.Id, e.Title, e.Description, e.Date, e.Time, e.Location, e.Kind, e.IsPublic, e.ResponsibleMemberId, e.IsCancelled, e.MinistryId)).ToList());
    }

    private async Task<string?> CheckCoordinatorAsync(Guid? userId, Guid churchId)
    {
        if (userId is null) return null;
        var u = await _users.FindByIdAsync(userId.Value.ToString());
        // Same church, active, and really a Coordinador: a user id from another church is just "invalid".
        if (u is null || u.ChurchId != churchId || !u.IsActive || !await _users.IsInRoleAsync(u, nameof(UserRole.Coordinador)))
            return "CoordinatorUserId must be an active Coordinador of this church.";
        return null;
    }

    private Task<bool> NameTakenAsync(string name, Guid? exceptId, CancellationToken ct)
    {
        var lower = name.ToLower();
        return _ministries.Query().AsNoTracking().AnyAsync(x => x.Name.ToLower() == lower && x.Id != exceptId, ct);
    }

    private async Task<Result<MinistryResponse>> SaveAsync(Ministry m, CancellationToken ct)
    {
        try { await _ministries.SaveChangesAsync(ct); }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return Result<MinistryResponse>.Fail(ErrorKind.Conflict, "A ministry with that name already exists.");
        }
        return Result<MinistryResponse>.Ok(ToResponse(m, await CountAsync(m.Id, ct)));
    }

    private Task<int> CountAsync(Guid id, CancellationToken ct) =>
        _links.Query().AsNoTracking().CountAsync(l => l.MinistryId == id && l.IsActive, ct);

    private async Task<IReadOnlyList<MinistryMemberResponse>> ListMembersAsync(Guid id, CancellationToken ct) =>
        await (from l in _links.Query().AsNoTracking()
               where l.MinistryId == id && l.IsActive
               join mem in _members.Query().AsNoTracking() on l.MemberId equals mem.Id
               orderby mem.FullName, mem.Id
               select new MinistryMemberResponse(mem.Id, mem.FullName)).ToListAsync(ct);

    private static MinistryResponse ToResponse(Ministry m, int count) =>
        new(m.Id, m.Name, m.Description, m.CoordinatorUserId, m.IsActive, count);
}


