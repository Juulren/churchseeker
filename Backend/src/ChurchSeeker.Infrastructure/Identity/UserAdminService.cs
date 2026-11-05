using ChurchSeeker.Application.Auditing;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Identity;

public sealed class UserAdminService : IUserAdminService
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly AppDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditLogger _audit;
    private readonly IEmailSender _mail;
    private readonly TimeProvider _clock;
    private readonly ChurchAccess _access;

    public UserAdminService(UserManager<ApplicationUser> users, AppDbContext db, ICurrentUser current, IAuditLogger audit, IEmailSender mail, TimeProvider clock, ChurchAccess access)
    {
        _users = users; _db = db; _current = current; _audit = audit; _mail = mail; _clock = clock; _access = access;
    }

    private bool IsAdmin => _current.Role == UserRole.Administrador && _current.ChurchId is not null;

    public async Task<AuthResult<IReadOnlyList<ManagedUser>>> ListAsync(bool includeInactive, CancellationToken ct = default)
    {
        if (!IsAdmin) return AuthResult<IReadOnlyList<ManagedUser>>.Fail(AuthError.Forbidden);
        var churchId = _current.ChurchId!.Value;
        // Identity users are not covered by the tenant filter: the church is always checked explicitly (its access rows).
        var rows = await _access.StaffOf(churchId).Where(u => includeInactive || u.IsActive).OrderBy(u => u.FullName).Take(500).ToListAsync(ct);
        var list = new List<ManagedUser>();
        foreach (var u in rows)
            if (await RoleOf(u) is { } role && role != UserRole.SuperAdministrador) list.Add(ToManaged(u, role, await IsSharedAsync(u, ct)));
        return AuthResult<IReadOnlyList<ManagedUser>>.Ok(list);
    }

    public async Task<AuthResult<ManagedUser>> SetRoleAsync(Guid id, UserRole role, CancellationToken ct = default)
    {
        if (!IsAdmin) return AuthResult<ManagedUser>.Fail(AuthError.Forbidden);
        // A church can give only the church roles: the platform role never comes from here, not even by number.
        if (!UserRoles.ChurchAssignable.Contains(role)) return AuthResult<ManagedUser>.Fail(AuthError.Validation, "Invalid role.");
        var user = await FindAsync(id);
        if (user is null) return AuthResult<ManagedUser>.Fail(AuthError.NotFound);
        if (user.Id == _current.UserId) return AuthResult<ManagedUser>.Fail(AuthError.Forbidden, "You cannot change your own role.");
        if (await IsSharedAsync(user, ct)) return AuthResult<ManagedUser>.Fail(AuthError.Forbidden, SharedMessage);

        var old = await RoleOf(user);
        if (old == role) return AuthResult<ManagedUser>.Ok(ToManaged(user, role));
        if (old == UserRole.Administrador && user.IsActive && !await AnotherActiveAdminAsync(user))
            return AuthResult<ManagedUser>.Fail(AuthError.Conflict, "The church must keep at least one active administrator.");

        foreach (var current in await _users.GetRolesAsync(user)) await _users.RemoveFromRoleAsync(user, current);
        await _users.AddToRoleAsync(user, role.ToString());
        await _users.UpdateSecurityStampAsync(user);
        await RevokeSessionsAsync(user.Id, ct);
        await _audit.WriteAsync(new AuditEntry("user.role_changed", user.ChurchId, _current.UserId, nameof(ApplicationUser), user.Id.ToString(), $"{old}->{role}"), ct);
        return AuthResult<ManagedUser>.Ok(ToManaged(user, role));
    }

    public async Task<AuthResult<ManagedUser>> SetActiveAsync(Guid id, bool active, CancellationToken ct = default)
    {
        if (!IsAdmin) return AuthResult<ManagedUser>.Fail(AuthError.Forbidden);
        var user = await FindAsync(id);
        if (user is null) return AuthResult<ManagedUser>.Fail(AuthError.NotFound);
        if (user.Id == _current.UserId) return AuthResult<ManagedUser>.Fail(AuthError.Forbidden, "You cannot deactivate yourself.");
        if (await IsSharedAsync(user, ct)) return AuthResult<ManagedUser>.Fail(AuthError.Forbidden, SharedMessage);
        var role = await RoleOf(user);
        if (role is null) return AuthResult<ManagedUser>.Fail(AuthError.NotFound);
        if (user.IsActive == active) return AuthResult<ManagedUser>.Ok(ToManaged(user, role.Value));
        if (!active && role == UserRole.Administrador && !await AnotherActiveAdminAsync(user))
            return AuthResult<ManagedUser>.Fail(AuthError.Conflict, "The church must keep at least one active administrator.");

        user.IsActive = active;
        var saved = await _users.UpdateAsync(user);
        if (!saved.Succeeded) return AuthResult<ManagedUser>.Fail(AuthError.Conflict, "The user changed at the same time. Try again.");
        if (!active) await RevokeSessionsAsync(user.Id, ct);
        await _audit.WriteAsync(new AuditEntry(active ? "user.activated" : "user.deactivated", user.ChurchId, _current.UserId, nameof(ApplicationUser), user.Id.ToString()), ct);
        return AuthResult<ManagedUser>.Ok(ToManaged(user, role.Value));
    }

    public async Task<AuthResult<bool>> SendPasswordResetAsync(Guid id, CancellationToken ct = default)
    {
        if (!IsAdmin) return AuthResult<bool>.Fail(AuthError.Forbidden);
        var user = await FindAsync(id);
        if (user is null || !user.IsActive) return AuthResult<bool>.Fail(AuthError.NotFound);
        if (await IsSharedAsync(user, ct)) return AuthResult<bool>.Fail(AuthError.Forbidden, SharedMessage);
        var token = await _users.GeneratePasswordResetTokenAsync(user);
        await _mail.SendPasswordResetAsync(user.Email!, token, ct);
        await _audit.WriteAsync(new AuditEntry("user.reset_sent", user.ChurchId, _current.UserId, nameof(ApplicationUser), user.Id.ToString()), ct);
        return AuthResult<bool>.Ok(true);
    }

    private const string SharedMessage = "This account works in several churches: only the platform can change it.";

    // A user who does not work in this church, and the platform account, simply do not exist for this administrator.
    private async Task<ApplicationUser?> FindAsync(Guid id)
    {
        var user = await _users.FindByIdAsync(id.ToString());
        if (user is null || _current.ChurchId is not { } churchId) return null;
        if (!await _db.UserChurchAccess.AnyAsync(a => a.UserId == user.Id && a.ChurchId == churchId)) return null;
        return await RoleOf(user) == UserRole.SuperAdministrador ? null : user;
    }

    // An account with access to several churches, or whose home is another church, is managed only by the platform.
    private async Task<bool> IsSharedAsync(ApplicationUser user, CancellationToken ct) =>
        user.ChurchId != _current.ChurchId || await _db.UserChurchAccess.CountAsync(a => a.UserId == user.Id, ct) > 1;

    private async Task<UserRole?> RoleOf(ApplicationUser u) =>
        (await _users.GetRolesAsync(u)).Select(r => Enum.TryParse<UserRole>(r, out var p) ? p : (UserRole?)null).FirstOrDefault(r => r is not null);

    private async Task<bool> AnotherActiveAdminAsync(ApplicationUser except)
    {
        var churchId = _current.ChurchId;
        var admins = await _users.GetUsersInRoleAsync(nameof(UserRole.Administrador));
        foreach (var u in admins.Where(u => u.Id != except.Id && u.IsActive))
            if (await _db.UserChurchAccess.AnyAsync(a => a.UserId == u.Id && a.ChurchId == churchId)) return true;
        return false;
    }

    private async Task RevokeSessionsAsync(Guid userId, CancellationToken ct)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        foreach (var t in await _db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct)) t.Revoke(now);
        await _db.SaveChangesAsync(ct);
    }

    private ManagedUser ToManaged(ApplicationUser u, UserRole role, bool shared = false) => new(u.Id, u.Email!, u.FullName, role, u.IsActive, u.Id == _current.UserId, shared);
}
