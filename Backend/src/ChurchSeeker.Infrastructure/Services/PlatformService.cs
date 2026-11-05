using ChurchSeeker.Application.Auditing;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Platform;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.Infrastructure.Services;

/// <summary>
/// The platform account's tools: the general dashboard and who may work in which church. Every method refuses anyone else.
/// </summary>
public sealed class PlatformService : IPlatformService
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly AppDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditLogger _audit;
    private readonly TimeProvider _clock;
    private readonly IServiceScopeFactory _scopes;
    private readonly ChurchAccess _access;

    public PlatformService(UserManager<ApplicationUser> users, AppDbContext db, ICurrentUser current, IAuditLogger audit,
                           TimeProvider clock, IServiceScopeFactory scopes, ChurchAccess access)
    {
        _users = users; _db = db; _current = current; _audit = audit; _clock = clock; _scopes = scopes; _access = access;
    }

    private bool IsSuper => _current.IsSuper;

    public async Task<AuthResult<PlatformOverview>> OverviewAsync(CancellationToken ct = default)
    {
        if (!IsSuper) return AuthResult<PlatformOverview>.Fail(AuthError.Forbidden);

        var churches = await _db.Churches.AsNoTracking().OrderBy(c => c.Name).Select(c => new { c.Id, c.Name, c.IsActive }).ToListAsync(ct);
        var today = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);
        var rows = new List<ChurchOverview>();
        foreach (var c in churches)
        {
            // Each church is counted in a scope of its own, through the normal tenant filter: this request's own scope is never
            // pointed at another church, so nothing later in the request can read the wrong one.
            using var scope = _scopes.CreateScope();
            scope.ServiceProvider.GetRequiredService<PublicTenantScope>().Use(c.Id);
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            rows.Add(await CountAsync(db, c.Id, c.Name, c.IsActive, today, ct));
        }

        var live = rows.Where(r => r.IsActive).ToList();
        return AuthResult<PlatformOverview>.Ok(new PlatformOverview(rows, live.Sum(r => r.ActiveMembers), live.Sum(r => r.UpcomingEvents),
            live.Sum(r => r.AttendancesThisMonth), live.Sum(r => r.ActiveMinistries), live.Sum(r => r.IncomeThisMonth), live.Sum(r => r.IncomeThisYear)));
    }

    private static async Task<ChurchOverview> CountAsync(AppDbContext db, Guid id, string name, bool active, DateOnly today, CancellationToken ct)
    {
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var yearStart = new DateOnly(today.Year, 1, 1);
        var members = await db.Members.AsNoTracking().CountAsync(m => m.IsActive, ct);
        var events = await db.Events.AsNoTracking().CountAsync(e => !e.IsCancelled && e.Date >= today && e.Date <= today.AddDays(30), ct);
        var attendances = await (from a in db.Attendances.AsNoTracking()
                                 join e in db.Events.AsNoTracking() on a.EventId equals e.Id
                                 where a.Present && e.Date >= monthStart && e.Date <= today
                                 select a.Id).CountAsync(ct);
        var ministries = await db.Ministries.AsNoTracking().CountAsync(m => m.IsActive, ct);
        var month = await db.Donations.AsNoTracking().Where(d => d.IsActive && d.Date >= monthStart && d.Date <= today).SumAsync(d => (long?)d.AmountCents, ct) ?? 0;
        var year = await db.Donations.AsNoTracking().Where(d => d.IsActive && d.Date >= yearStart && d.Date <= today).SumAsync(d => (long?)d.AmountCents, ct) ?? 0;
        var admins = await (from a in db.UserChurchAccess
                            join u in db.Users on a.UserId equals u.Id
                            join ur in db.UserRoles on u.Id equals ur.UserId
                            join r in db.Roles on ur.RoleId equals r.Id
                            where a.ChurchId == id && u.IsActive && r.Name == nameof(UserRole.Administrador)
                            select u.Id).Distinct().CountAsync(ct);
        return new ChurchOverview(id, name, active, members, events, attendances, ministries, admins, month / 100m, year / 100m);
    }

    public async Task<AuthResult<IReadOnlyList<PlatformStaff>>> ListStaffAsync(CancellationToken ct = default)
    {
        if (!IsSuper) return AuthResult<IReadOnlyList<PlatformStaff>>.Fail(AuthError.Forbidden);
        var users = await _users.Users.OrderBy(u => u.FullName).Take(1000).ToListAsync(ct);
        var roles = await (from ur in _db.UserRoles join r in _db.Roles on ur.RoleId equals r.Id select new { ur.UserId, r.Name }).ToListAsync(ct);
        var access = await (from a in _db.UserChurchAccess join c in _db.Churches on a.ChurchId equals c.Id select new { a.UserId, Ref = new ChurchRef(c.Id, c.Name) }).ToListAsync(ct);

        var list = new List<PlatformStaff>();
        foreach (var u in users)
        {
            var role = roles.Where(r => r.UserId == u.Id).Select(r => Enum.TryParse<UserRole>(r.Name, out var p) ? p : (UserRole?)null).FirstOrDefault(r => r is not null);
            if (role is null) continue;
            list.Add(new PlatformStaff(u.Id, u.Email!, u.FullName, role.Value, u.IsActive, u.ChurchId,
                access.Where(a => a.UserId == u.Id).Select(a => a.Ref).OrderBy(r => r.Name).ToList()));
        }
        return AuthResult<IReadOnlyList<PlatformStaff>>.Ok(list);
    }

    public async Task<AuthResult<PlatformStaff>> SetChurchesAsync(Guid userId, IReadOnlyList<Guid> churchIds, CancellationToken ct = default)
    {
        if (!IsSuper) return AuthResult<PlatformStaff>.Fail(AuthError.Forbidden);
        var user = await _users.FindByIdAsync(userId.ToString());
        if (user is null) return AuthResult<PlatformStaff>.Fail(AuthError.NotFound);
        var role = await RoleOf(user);
        if (role is null) return AuthResult<PlatformStaff>.Fail(AuthError.NotFound);
        // The platform account works everywhere already, and a plain Usuario never works in any church.
        if (role is UserRole.SuperAdministrador or UserRole.Usuario)
            return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "This account does not take church access.");

        var wanted = (churchIds ?? []).Distinct().ToList();
        if (wanted.Count == 0) return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "At least one church is required.");
        // Several churches only for administrators; every other staff role works in exactly one.
        if (role != UserRole.Administrador && wanted.Count > 1)
            return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "Only an administrator can work in several churches.");

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var current = await _db.UserChurchAccess.Where(a => a.UserId == userId).ToListAsync(ct);
        var held = current.Select(a => a.ChurchId).ToHashSet();
        // A new church must be active; one the account already has can stay even if it was switched off since.
        var valid = await _db.Churches.AsNoTracking().Where(c => wanted.Contains(c.Id) && (c.IsActive || held.Contains(c.Id))).Select(c => c.Id).ToListAsync(ct);
        if (valid.Count != wanted.Count) return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "Every church must exist and be active.");

        var removed = current.Where(a => !wanted.Contains(a.ChurchId)).ToList();
        var added = wanted.Where(w => !held.Contains(w)).ToList();

        // A church must keep an active administrator: the same rule as everywhere else, now across the access rows.
        if (role == UserRole.Administrador && user.IsActive && !await KeepsAnAdministratorAsync(userId, removed.Select(r => r.ChurchId), ct))
            return AuthResult<PlatformStaff>.Fail(AuthError.Conflict, "A church must keep at least one active administrator.");

        _db.UserChurchAccess.RemoveRange(removed);
        foreach (var w in added) _db.UserChurchAccess.Add(new UserChurchAccess(userId, w));
        // The home church follows the access: it can never point at a church the account no longer works in.
        if (!wanted.Contains(user.ChurchId)) user.ChurchId = wanted[0];
        var saved = await _users.UpdateAsync(user);
        if (!saved.Succeeded) return AuthResult<PlatformStaff>.Fail(AuthError.Conflict, "The account changed at the same time. Try again.");

        if (removed.Count > 0) await EndSessionsAsync(user, ct);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        // Written explicitly: the automatic audit would file this under the platform account's own active church.
        await _audit.WriteAsync(new AuditEntry("platform.access_changed", null, _current.UserId, nameof(ApplicationUser), userId.ToString(),
            $"before={string.Join(",", current.Select(c => c.ChurchId))};after={string.Join(",", wanted)}"), ct);
        return AuthResult<PlatformStaff>.Ok(await ToStaffAsync(user, role.Value, ct));
    }

    public async Task<AuthResult<PlatformStaff>> SetActiveAsync(Guid userId, bool active, CancellationToken ct = default)
    {
        if (!IsSuper) return AuthResult<PlatformStaff>.Fail(AuthError.Forbidden);
        var user = await _users.FindByIdAsync(userId.ToString());
        var role = user is null ? null : await RoleOf(user);
        // The platform account itself is changed only through configuration, never through this panel.
        if (user is null || role is null || role == UserRole.SuperAdministrador) return AuthResult<PlatformStaff>.Fail(AuthError.NotFound);
        if (user.Id == _current.UserId) return AuthResult<PlatformStaff>.Fail(AuthError.Forbidden, "You cannot deactivate yourself.");
        if (user.IsActive == active) return AuthResult<PlatformStaff>.Ok(await ToStaffAsync(user, role.Value, ct));

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        if (!active && role == UserRole.Administrador && !await KeepsAnAdministratorAsync(userId, await HeldChurchesAsync(userId, ct), ct))
            return AuthResult<PlatformStaff>.Fail(AuthError.Conflict, "A church must keep at least one active administrator.");
        user.IsActive = active;
        var saved = await _users.UpdateAsync(user);
        if (!saved.Succeeded) return AuthResult<PlatformStaff>.Fail(AuthError.Conflict, "The account changed at the same time. Try again.");
        if (!active) await EndSessionsAsync(user, ct);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await _audit.WriteAsync(new AuditEntry(active ? "platform.user_activated" : "platform.user_deactivated", null, _current.UserId, nameof(ApplicationUser), userId.ToString()), ct);
        return AuthResult<PlatformStaff>.Ok(await ToStaffAsync(user, role.Value, ct));
    }

    public async Task<AuthResult<PlatformStaff>> SetRoleAsync(Guid userId, UserRole role, CancellationToken ct = default)
    {
        if (!IsSuper) return AuthResult<PlatformStaff>.Fail(AuthError.Forbidden);
        // The platform role is never handed out from here: it comes only from the seed.
        if (!UserRoles.ChurchAssignable.Contains(role)) return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "Invalid role.");
        var user = await _users.FindByIdAsync(userId.ToString());
        var old = user is null ? null : await RoleOf(user);
        if (user is null || old is null || old == UserRole.SuperAdministrador) return AuthResult<PlatformStaff>.Fail(AuthError.NotFound);
        if (user.Id == _current.UserId) return AuthResult<PlatformStaff>.Fail(AuthError.Forbidden, "You cannot change your own role.");
        if (old == role) return AuthResult<PlatformStaff>.Ok(await ToStaffAsync(user, role, ct));

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var held = await HeldChurchesAsync(userId, ct);
        // Only an administrator works in several churches: cut the access down first.
        if (role != UserRole.Administrador && held.Count > 1)
            return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "Reduce the account to one church before changing its role.");
        if (old == UserRole.Administrador && user.IsActive && !await KeepsAnAdministratorAsync(userId, held, ct))
            return AuthResult<PlatformStaff>.Fail(AuthError.Conflict, "A church must keep at least one active administrator.");

        foreach (var r in await _users.GetRolesAsync(user)) await _users.RemoveFromRoleAsync(user, r);
        await _users.AddToRoleAsync(user, role.ToString());
        await EndSessionsAsync(user, ct);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await _audit.WriteAsync(new AuditEntry("platform.role_changed", null, _current.UserId, nameof(ApplicationUser), userId.ToString(), $"{old}->{role}"), ct);
        return AuthResult<PlatformStaff>.Ok(await ToStaffAsync(user, role, ct));
    }

    // Ends every session of the account: the stamp for Identity, the refresh tokens so nothing renews.
    private async Task EndSessionsAsync(ApplicationUser user, CancellationToken ct)
    {
        await _users.UpdateSecurityStampAsync(user);
        var now = _clock.GetUtcNow().UtcDateTime;
        foreach (var t in await _db.RefreshTokens.Where(t => t.UserId == user.Id && t.RevokedAt == null).ToListAsync(ct)) t.Revoke(now);
    }

    private Task<List<Guid>> HeldChurchesAsync(Guid userId, CancellationToken ct) =>
        _db.UserChurchAccess.Where(a => a.UserId == userId).Select(a => a.ChurchId).ToListAsync(ct);

    // True when every ACTIVE church in the list still has another active administrator once this one is gone from it.
    private async Task<bool> KeepsAnAdministratorAsync(Guid userId, IEnumerable<Guid> churchIds, CancellationToken ct)
    {
        var ids = churchIds.ToList();
        var active = await _db.Churches.AsNoTracking().Where(c => c.IsActive && ids.Contains(c.Id)).Select(c => c.Id).ToListAsync(ct);
        foreach (var id in active)
            if (!await AnotherActiveAdminAsync(userId, id, ct)) return false;
        return true;
    }

    public async Task<AuthResult<PlatformStaff>> CreateStaffAsync(CreatePlatformStaffRequest request, CancellationToken ct = default)
    {
        if (!IsSuper) return AuthResult<PlatformStaff>.Fail(AuthError.Forbidden);
        var email = request.Email?.Trim() ?? string.Empty;
        var name = request.FullName?.Trim() ?? string.Empty;
        var wanted = (request.ChurchIds ?? []).Distinct().ToList();
        if (email.Length == 0 || email.Length > 256 || name.Length == 0 || name.Length > 200 || !UserRoles.ChurchAssignable.Contains(request.Role))
            return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "Invalid email, name or role.");
        if (wanted.Count == 0 || (request.Role != UserRole.Administrador && wanted.Count > 1))
            return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "Only an administrator can work in several churches, and at least one church is required.");
        var valid = await _db.Churches.AsNoTracking().Where(c => c.IsActive && wanted.Contains(c.Id)).Select(c => c.Id).ToListAsync(ct);
        if (valid.Count != wanted.Count) return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "Every church must exist and be active.");

        var user = new ApplicationUser { Id = Guid.NewGuid(), UserName = email, Email = email, FullName = name, ChurchId = wanted[0], IsActive = true };
        var created = await _users.CreateAsync(user, request.Password ?? string.Empty);
        if (!created.Succeeded) return AuthResult<PlatformStaff>.Fail(AuthError.Validation, created.Errors.Select(e => e.Description).ToArray());
        var roled = await _users.AddToRoleAsync(user, request.Role.ToString());
        if (!roled.Succeeded)
        {
            await _users.DeleteAsync(user);
            return AuthResult<PlatformStaff>.Fail(AuthError.Validation, "The role could not be assigned.");
        }
        foreach (var w in wanted) _db.UserChurchAccess.Add(new UserChurchAccess(user.Id, w));
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync(new AuditEntry("platform.user_created", null, _current.UserId, nameof(ApplicationUser), user.Id.ToString(),
            $"role={request.Role};churches={string.Join(",", wanted)}"), ct);
        return AuthResult<PlatformStaff>.Ok(await ToStaffAsync(user, request.Role, ct));
    }

    private async Task<UserRole?> RoleOf(ApplicationUser u) =>
        (await _users.GetRolesAsync(u)).Select(r => Enum.TryParse<UserRole>(r, out var p) ? p : (UserRole?)null).FirstOrDefault(r => r is not null);

    private async Task<bool> AnotherActiveAdminAsync(Guid except, Guid churchId, CancellationToken ct)
    {
        var admins = await _users.GetUsersInRoleAsync(nameof(UserRole.Administrador));
        foreach (var a in admins.Where(a => a.Id != except && a.IsActive))
            if (await _db.UserChurchAccess.AnyAsync(x => x.UserId == a.Id && x.ChurchId == churchId, ct)) return true;
        return false;
    }

    private async Task<PlatformStaff> ToStaffAsync(ApplicationUser u, UserRole role, CancellationToken ct) =>
        new(u.Id, u.Email!, u.FullName, role, u.IsActive, u.ChurchId,
            await (from a in _db.UserChurchAccess join c in _db.Churches on a.ChurchId equals c.Id where a.UserId == u.Id orderby c.Name select new ChurchRef(c.Id, c.Name)).ToListAsync(ct));
}
