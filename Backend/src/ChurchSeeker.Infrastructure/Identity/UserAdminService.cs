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

    public UserAdminService(UserManager<ApplicationUser> users, AppDbContext db, ICurrentUser current, IAuditLogger audit, IEmailSender mail, TimeProvider clock)
    {
        _users = users; _db = db; _current = current; _audit = audit; _mail = mail; _clock = clock;
    }

    private bool IsAdmin => _current.Role == UserRole.Administrador && _current.ChurchId is not null;

    public async Task<AuthResult<IReadOnlyList<ManagedUser>>> ListAsync(bool includeInactive, CancellationToken ct = default)
    {
        if (!IsAdmin) return AuthResult<IReadOnlyList<ManagedUser>>.Fail(AuthError.Forbidden);
        var churchId = _current.ChurchId!.Value;
        // Identity users are not covered by the tenant filter: the church is always checked explicitly.
        var rows = await _users.Users.Where(u => u.ChurchId == churchId && (includeInactive || u.IsActive)).OrderBy(u => u.FullName).Take(500).ToListAsync(ct);
        var list = new List<ManagedUser>();
        foreach (var u in rows)
            if (await RoleOf(u) is { } role) list.Add(ToManaged(u, role));
        return AuthResult<IReadOnlyList<ManagedUser>>.Ok(list);
    }

    public async Task<AuthResult<ManagedUser>> SetRoleAsync(Guid id, UserRole role, CancellationToken ct = default)
    {
        if (!IsAdmin) return AuthResult<ManagedUser>.Fail(AuthError.Forbidden);
        if (!Enum.IsDefined(role)) return AuthResult<ManagedUser>.Fail(AuthError.Validation, "Invalid role.");
        var user = await FindAsync(id);
        if (user is null) return AuthResult<ManagedUser>.Fail(AuthError.NotFound);
        if (user.Id == _current.UserId) return AuthResult<ManagedUser>.Fail(AuthError.Forbidden, "You cannot change your own role.");

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
        var token = await _users.GeneratePasswordResetTokenAsync(user);
        await _mail.SendPasswordResetAsync(user.Email!, token, ct);
        await _audit.WriteAsync(new AuditEntry("user.reset_sent", user.ChurchId, _current.UserId, nameof(ApplicationUser), user.Id.ToString()), ct);
        return AuthResult<bool>.Ok(true);
    }

    // A user of another church simply does not exist for this administrator.
    private async Task<ApplicationUser?> FindAsync(Guid id)
    {
        var user = await _users.FindByIdAsync(id.ToString());
        return user is not null && user.ChurchId == _current.ChurchId ? user : null;
    }

    private async Task<UserRole?> RoleOf(ApplicationUser u) =>
        (await _users.GetRolesAsync(u)).Select(r => Enum.TryParse<UserRole>(r, out var p) ? p : (UserRole?)null).FirstOrDefault(r => r is not null);

    private async Task<bool> AnotherActiveAdminAsync(ApplicationUser except) =>
        (await _users.GetUsersInRoleAsync(nameof(UserRole.Administrador))).Any(u => u.Id != except.Id && u.ChurchId == except.ChurchId && u.IsActive);

    private async Task RevokeSessionsAsync(Guid userId, CancellationToken ct)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        foreach (var t in await _db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct)) t.Revoke(now);
        await _db.SaveChangesAsync(ct);
    }

    private ManagedUser ToManaged(ApplicationUser u, UserRole role) => new(u.Id, u.Email!, u.FullName, role, u.IsActive, u.Id == _current.UserId);
}
