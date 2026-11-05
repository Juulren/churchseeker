using ChurchSeeker.Application.Auditing;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using ChurchSeeker.Infrastructure.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Identity;

public sealed class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly AppDbContext _db;
    private readonly ITokenService _tokens;
    private readonly IEmailSender _mail;
    private readonly ICurrentUser _current;
    private readonly TimeProvider _clock;
    private readonly IAuditLogger _audit;
    private readonly ChurchAccess _access;

    public AuthService(UserManager<ApplicationUser> users, AppDbContext db, ITokenService tokens,
                       IEmailSender mail, ICurrentUser current, TimeProvider clock, IAuditLogger audit, ChurchAccess access)
    {
        _users = users; _db = db; _tokens = tokens; _mail = mail; _current = current; _clock = clock; _audit = audit; _access = access;
    }

    // Never put the email or password in audit details: only ids.
    private Task AuditAsync(string action, ApplicationUser? user, CancellationToken ct, string? details = null) =>
        _audit.WriteAsync(new AuditEntry(action, user?.ChurchId, user?.Id, nameof(ApplicationUser), user?.Id.ToString(), details), ct);

    private DateTime Now => _clock.GetUtcNow().UtcDateTime;

    public async Task<AuthResult<AuthTokens>> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var email = request.Email?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;
        var user = await _users.FindByEmailAsync(email);

        if (user is null)
        {
            // Spend comparable time so response timing does not reveal unknown emails.
            _users.PasswordHasher.HashPassword(new ApplicationUser(), password);
            await AuditAsync("auth.login.failed", null, ct, "unknown account");
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidCredentials);
        }

        // Locked and inactive accounts get the same generic answer as a wrong password.
        if (!user.IsActive || await _users.IsLockedOutAsync(user))
        {
            await AuditAsync("auth.login.blocked", user, ct);
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidCredentials);
        }

        if (!await _users.CheckPasswordAsync(user, password))
        {
            user = await RetryOnConflictAsync(user, u => _users.AccessFailedAsync(u)) ?? user;
            await AuditAsync("auth.login.failed", user, ct);
            if (await _users.IsLockedOutAsync(user)) await AuditAsync("auth.account.locked", user, ct);
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidCredentials);
        }

        user = await RetryOnConflictAsync(user, u => _users.ResetAccessFailedCountAsync(u)) ?? user;
        var issued = await IssueAsync(user, null, ct);
        if (issued is null)
        {
            // An account whose churches are all inactive has nowhere to work: the same generic answer as a wrong password.
            await AuditAsync("auth.login.no_church", user, ct);
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidCredentials);
        }
        await _db.SaveChangesAsync(ct);
        await AuditAsync("auth.login.succeeded", user, ct);
        return AuthResult<AuthTokens>.Ok(issued.Value.Tokens);
    }

    public async Task<AuthResult<AuthTokens>> RefreshAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        var hash = _tokens.Hash(refreshToken);
        var stored = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null)
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        var now = Now;
        if (stored.RevokedAt is not null)
        {
            // A revoked token came back: assume theft and kill every session of that user.
            await RevokeAllAsync(stored.UserId, now, ct);
            await _db.SaveChangesAsync(ct);
            await AuditAsync("auth.refresh.reuse_detected", await _users.FindByIdAsync(stored.UserId.ToString()), ct);
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);
        }
        if (!stored.IsActiveAt(now))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        var user = await _users.FindByIdAsync(stored.UserId.ToString());
        if (user is null || !user.IsActive || await _users.IsLockedOutAsync(user))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        // The session keeps its church if the user may still use it; otherwise it falls back to the home church.
        var issued = await IssueAsync(user, stored.ChurchId, ct);
        if (issued is null) return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);
        stored.Revoke(now, issued.Value.RefreshHash);
        if (!await TrySaveSpentAsync(stored.UserId, ct)) return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);
        return AuthResult<AuthTokens>.Ok(issued.Value.Tokens);
    }

    // Another request spent the same token a moment earlier: that is a replay, so every session of the user ends.
    private async Task<bool> TrySaveSpentAsync(Guid userId, CancellationToken ct)
    {
        try { await _db.SaveChangesAsync(ct); return true; }
        catch (DbUpdateConcurrencyException)
        {
            _db.ChangeTracker.Clear();
            await RevokeAllAsync(userId, Now, ct);
            await _db.SaveChangesAsync(ct);
            await AuditAsync("auth.refresh.reuse_detected", await _users.FindByIdAsync(userId.ToString()), ct);
            return false;
        }
    }

    public async Task<AuthResult<AuthTokens>> SwitchChurchAsync(string? refreshToken, Guid churchId, CancellationToken ct = default)
    {
        if (_current.UserId is not { } userId || string.IsNullOrWhiteSpace(refreshToken))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        var hash = _tokens.Hash(refreshToken);
        var stored = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        var now = Now;
        // The refresh cookie must be this user's and still alive: switching never works from a stolen access token alone.
        if (stored is null || stored.UserId != userId)
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);
        if (stored.RevokedAt is not null)
        {
            await RevokeAllAsync(userId, now, ct);
            await _db.SaveChangesAsync(ct);
            await AuditAsync("auth.refresh.reuse_detected", await _users.FindByIdAsync(userId.ToString()), ct);
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);
        }
        if (!stored.IsActiveAt(now))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        var user = await _users.FindByIdAsync(userId.ToString());
        if (user is null || !user.IsActive || await _users.IsLockedOutAsync(user))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        var roles = await _users.GetRolesAsync(user);
        var isSuper = roles.Contains(nameof(UserRole.SuperAdministrador));
        // Asked for a church outside the user's own: refused, never silently replaced by another one.
        if (!await _access.CanUseAsync(userId, isSuper, churchId, ct))
            return AuthResult<AuthTokens>.Fail(AuthError.Forbidden);

        var previous = stored.ChurchId;
        var issued = await IssueAsync(user, churchId, ct);
        if (issued is null) return AuthResult<AuthTokens>.Fail(AuthError.Forbidden);
        stored.Revoke(now, issued.Value.RefreshHash);
        if (!await TrySaveSpentAsync(userId, ct)) return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);
        await _audit.WriteAsync(new AuditEntry("auth.church_switched", churchId, userId, nameof(ApplicationUser), userId.ToString(), $"from={previous};to={churchId}"), ct);
        return AuthResult<AuthTokens>.Ok(issued.Value.Tokens);
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return;
        var hash = _tokens.Hash(refreshToken);
        var stored = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null) return;
        stored.Revoke(Now);
        await _db.SaveChangesAsync(ct);
        await AuditAsync("auth.logout", await _users.FindByIdAsync(stored.UserId.ToString()), ct);
    }

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct = default)
    {
        // Same observable behaviour whether or not the email exists.
        var user = await _users.FindByEmailAsync(request.Email?.Trim() ?? string.Empty);
        if (user is null || !user.IsActive) return;
        var token = await _users.GeneratePasswordResetTokenAsync(user);
        await AuditAsync("auth.password.reset_requested", user, ct);
        await _mail.SendPasswordResetAsync(user.Email!, token, ct);
    }

    public async Task<AuthResult<bool>> ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        var user = await _users.FindByEmailAsync(request.Email?.Trim() ?? string.Empty);
        if (user is null || !user.IsActive || string.IsNullOrWhiteSpace(request.Token))
            return AuthResult<bool>.Fail(AuthError.InvalidToken);

        // Identity tokens are bound to the security stamp, which changes on success: single use.
        var result = await _users.ResetPasswordAsync(user, request.Token, request.NewPassword ?? string.Empty);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code == nameof(IdentityErrorDescriber.InvalidToken)))
            {
                await AuditAsync("auth.password.reset_failed", user, ct);
                return AuthResult<bool>.Fail(AuthError.InvalidToken);
            }
            return AuthResult<bool>.Fail(AuthError.Validation, result.Errors.Select(e => e.Description).ToArray());
        }

        await _users.ResetAccessFailedCountAsync(user);
        await RevokeAllAsync(user.Id, Now, ct);
        await _db.SaveChangesAsync(ct);
        await AuditAsync("auth.password.reset_completed", user, ct);
        return AuthResult<bool>.Ok(true);
    }

    public async Task<AuthResult<UserInfo>> RegisterUserAsync(RegisterUserRequest request, CancellationToken ct = default)
    {
        if (_current.Role != UserRole.Administrador || _current.ChurchId is not { } churchId)
            return AuthResult<UserInfo>.Fail(AuthError.Forbidden);

        var email = request.Email?.Trim() ?? string.Empty;
        var name = request.FullName?.Trim() ?? string.Empty;
        // The platform role is never given through a church: only the seed or the platform itself creates it.
        if (email.Length == 0 || email.Length > 256 || name.Length == 0 || name.Length > 200 || !UserRoles.ChurchAssignable.Contains(request.Role))
            return AuthResult<UserInfo>.Fail(AuthError.Validation, "Invalid email, name or role.");

        // New users always land in the caller's church: ChurchId is never taken from the payload.
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(), UserName = email, Email = email, FullName = name, ChurchId = churchId, IsActive = true
        };
        var created = await _users.CreateAsync(user, request.Password ?? string.Empty);
        if (!created.Succeeded)
            return AuthResult<UserInfo>.Fail(AuthError.Validation, created.Errors.Select(e => e.Description).ToArray());

        var roled = await _users.AddToRoleAsync(user, request.Role.ToString());
        if (!roled.Succeeded)
        {
            // Never leave an account without a role: it could not sign in.
            await _users.DeleteAsync(user);
            return AuthResult<UserInfo>.Fail(AuthError.Validation, "The role could not be assigned.");
        }
        await _access.AddAsync(user.Id, churchId);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync(new AuditEntry("user.created", churchId, _current.UserId, nameof(ApplicationUser), user.Id.ToString(), $"role={request.Role}"), ct);
        return AuthResult<UserInfo>.Ok(new UserInfo(user.Id, email, name, request.Role, churchId));
    }

    public async Task<AuthResult<IReadOnlyList<UserInfo>>> ListUsersAsync(UserRole? role, CancellationToken ct = default)
    {
        if (_current.Role is not (UserRole.Administrador or UserRole.Pastor or UserRole.Secretario) || _current.ChurchId is not { } churchId)
            return AuthResult<IReadOnlyList<UserInfo>>.Fail(AuthError.Forbidden);

        // Identity users are not covered by the tenant filter: the church is always checked explicitly (its access rows).
        var inChurch = await _access.StaffOf(churchId).Where(u => u.IsActive).OrderBy(u => u.FullName).Take(400).ToListAsync(ct);
        var candidates = role is { } wanted && Enum.IsDefined(wanted)
            ? (await _users.GetUsersInRoleAsync(wanted.ToString())).Where(u => inChurch.Any(c => c.Id == u.Id)).ToList()
            : inChurch;

        var result = new List<UserInfo>();
        foreach (var u in candidates.OrderBy(u => u.FullName).Take(200))
        {
            var parsed = (await _users.GetRolesAsync(u)).Select(r => Enum.TryParse<UserRole>(r, out var p) ? p : (UserRole?)null).FirstOrDefault(r => r is not null);
            // The platform account is not part of any church's staff.
            if (parsed is not null && parsed is not (UserRole.SuperAdministrador or UserRole.Usuario)) result.Add(new UserInfo(u.Id, u.Email!, u.FullName, parsed.Value, churchId));
        }
        return AuthResult<IReadOnlyList<UserInfo>>.Ok(result);
    }

    // Concurrent requests update the same user row (failed-count, stamp). Identity uses optimistic
    // concurrency, so reload and retry: dropping an update would let parallel guesses outrun the lockout.
    // UserManager reports a conflict as a failed result and leaves the stale entity tracked,
    // so the tracker must be cleared or the next SaveChanges (audit write) would throw.
    private async Task<ApplicationUser?> RetryOnConflictAsync(ApplicationUser user, Func<ApplicationUser, Task<IdentityResult>> update)
    {
        const int maxAttempts = 12;
        var id = user.Id;
        for (var attempt = 0; attempt < maxAttempts; attempt++)
        {
            IdentityResult? result = null;
            try { result = await update(user); }
            catch (DbUpdateConcurrencyException) { /* handled below */ }

            if (result is { Succeeded: true }) return user;

            _db.ChangeTracker.Clear();
            var fresh = await _users.FindByIdAsync(id.ToString());
            if (fresh is null) return null;
            user = fresh;
            await Task.Delay(Random.Shared.Next(1, 15));
        }
        // Give up quietly: the caller still answers 401, never a 500.
        _db.ChangeTracker.Clear();
        return await _users.FindByIdAsync(id.ToString());
    }

    private async Task RevokeAllAsync(Guid userId, DateTime now, CancellationToken ct)
    {
        var active = await _db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct);
        foreach (var t in active) t.Revoke(now);
    }

    private async Task<(AuthTokens Tokens, string RefreshHash)?> IssueAsync(ApplicationUser user, Guid? preferredChurch, CancellationToken ct)
    {
        var roles = await _users.GetRolesAsync(user);
        var role = roles.Select(r => Enum.TryParse<UserRole>(r, out var parsed) ? parsed : (UserRole?)null)
                        .FirstOrDefault(r => r is not null);
        if (role is null)
            throw new InvalidOperationException("User has no valid role.");

        var isSuper = role == UserRole.SuperAdministrador;
        var church = await _access.ChooseAsync(user.Id, user.ChurchId, isSuper, preferredChurch, ct);
        if (church is null) return null;
        var info = new UserInfo(user.Id, user.Email!, user.FullName, role.Value, church.Value, await _access.ListAsync(user.Id, isSuper, ct));
        var now = Now;
        var access = _tokens.CreateAccessToken(info, now);
        var refresh = _tokens.CreateRefreshToken(now);
        _db.RefreshTokens.Add(new RefreshToken(user.Id, refresh.Hash, refresh.ExpiresAt, church));
        return (new AuthTokens(access.Token, access.ExpiresAt, refresh.Raw, refresh.ExpiresAt, info), refresh.Hash);
    }
}

