using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Identity;

/// <summary>
/// Which churches a user may work in. One source of truth: a row per (user, church), including the home church, and the
/// platform account may use every ACTIVE church. A church that is no longer active cannot be used by anyone.
/// </summary>
public sealed class ChurchAccess
{
    private readonly AppDbContext _db;

    public ChurchAccess(AppDbContext db) => _db = db;

    public async Task<IReadOnlyList<ChurchRef>> ListAsync(Guid userId, bool isSuper, CancellationToken ct = default)
    {
        var churches = _db.Churches.AsNoTracking().Where(c => c.IsActive);
        var query = isSuper
            ? churches
            : churches.Where(c => _db.UserChurchAccess.Any(a => a.UserId == userId && a.ChurchId == c.Id));
        return await query.OrderBy(c => c.Name).Select(c => new ChurchRef(c.Id, c.Name)).ToListAsync(ct);
    }

    public Task<bool> CanUseAsync(Guid userId, bool isSuper, Guid churchId, CancellationToken ct = default) =>
        _db.Churches.AsNoTracking().AnyAsync(c => c.Id == churchId && c.IsActive
            && (isSuper || _db.UserChurchAccess.Any(a => a.UserId == userId && a.ChurchId == churchId)), ct);

    /// <summary>The church a new session starts in: the one asked for if allowed, else the home church, else the first allowed one.</summary>
    public async Task<Guid?> ChooseAsync(Guid userId, Guid homeChurchId, bool isSuper, Guid? preferred, CancellationToken ct = default)
    {
        if (preferred is { } p && await CanUseAsync(userId, isSuper, p, ct)) return p;
        if (await CanUseAsync(userId, isSuper, homeChurchId, ct)) return homeChurchId;
        return (await ListAsync(userId, isSuper, ct)).FirstOrDefault()?.Id;
    }

    /// <summary>Users who work in a church: those with an access row for it (the home church counts).</summary>
    public IQueryable<ApplicationUser> StaffOf(Guid churchId) =>
        _db.Users.Where(u => _db.UserChurchAccess.Any(a => a.UserId == u.Id && a.ChurchId == churchId));

    public Task AddAsync(Guid userId, Guid churchId)
    {
        _db.UserChurchAccess.Add(new UserChurchAccess(userId, churchId));
        return Task.CompletedTask;
    }

    /// <summary>Every user has a row for their home church. Run at start-up: it also covers users created before the table existed.</summary>
    public async Task EnsureHomeRowsAsync(CancellationToken ct = default)
    {
        var missing = await _db.Users.Where(u => !_db.UserChurchAccess.Any(a => a.UserId == u.Id && a.ChurchId == u.ChurchId))
            .Select(u => new { u.Id, u.ChurchId }).ToListAsync(ct);
        foreach (var m in missing) _db.UserChurchAccess.Add(new UserChurchAccess(m.Id, m.ChurchId));
        if (missing.Count == 0) return;
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException)
        {
            // Another instance (or a user created at this very moment) inserted the same rows first: nothing left to do.
            _db.ChangeTracker.Clear();
        }
    }
}
