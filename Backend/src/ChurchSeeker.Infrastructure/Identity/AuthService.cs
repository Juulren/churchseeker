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

    public AuthService(UserManager<ApplicationUser> users, AppDbContext db, ITokenService tokens,
                       IEmailSender mail, ICurrentUser current, TimeProvider clock)
    {
        _users = users; _db = db; _tokens = tokens; _mail = mail; _current = current; _clock = clock;
    }

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
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidCredentials);
        }

        // Locked and inactive accounts get the same generic answer as a wrong password.
        if (!user.IsActive || await _users.IsLockedOutAsync(user))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidCredentials);

        if (!await _users.CheckPasswordAsync(user, password))
        {
            await _users.AccessFailedAsync(user);
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidCredentials);
        }

        await _users.ResetAccessFailedCountAsync(user);
        var issued = await IssueAsync(user, ct);
        await _db.SaveChangesAsync(ct);
        return AuthResult<AuthTokens>.Ok(issued.Tokens);
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
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);
        }
        if (!stored.IsActiveAt(now))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        var user = await _users.FindByIdAsync(stored.UserId.ToString());
        if (user is null || !user.IsActive || await _users.IsLockedOutAsync(user))
            return AuthResult<AuthTokens>.Fail(AuthError.InvalidToken);

        var issued = await IssueAsync(user, ct);
        stored.Revoke(now, issued.RefreshHash);
        await _db.SaveChangesAsync(ct);
        return AuthResult<AuthTokens>.Ok(issued.Tokens);
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return;
        var hash = _tokens.Hash(refreshToken);
        var stored = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null) return;
        stored.Revoke(Now);
        await _db.SaveChangesAsync(ct);
    }

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct = default)
    {
        // Same observable behaviour whether or not the email exists.
        var user = await _users.FindByEmailAsync(request.Email?.Trim() ?? string.Empty);
        if (user is null || !user.IsActive) return;
        var token = await _users.GeneratePasswordResetTokenAsync(user);
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
                return AuthResult<bool>.Fail(AuthError.InvalidToken);
            return AuthResult<bool>.Fail(AuthError.Validation, result.Errors.Select(e => e.Description).ToArray());
        }

        await _users.ResetAccessFailedCountAsync(user);
        await RevokeAllAsync(user.Id, Now, ct);
        await _db.SaveChangesAsync(ct);
        return AuthResult<bool>.Ok(true);
    }

    public async Task<AuthResult<UserInfo>> RegisterUserAsync(RegisterUserRequest request, CancellationToken ct = default)
    {
        if (_current.Role != UserRole.Administrador || _current.ChurchId is not { } churchId)
            return AuthResult<UserInfo>.Fail(AuthError.Forbidden);

        var email = request.Email?.Trim() ?? string.Empty;
        var name = request.FullName?.Trim() ?? string.Empty;
        if (email.Length == 0 || email.Length > 256 || name.Length == 0 || name.Length > 200 || !Enum.IsDefined(request.Role))
            return AuthResult<UserInfo>.Fail(AuthError.Validation, "Invalid email, name or role.");

        // New users always land in the caller's church: ChurchId is never taken from the payload.
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(), UserName = email, Email = email, FullName = name, ChurchId = churchId, IsActive = true
        };
        var created = await _users.CreateAsync(user, request.Password ?? string.Empty);
        if (!created.Succeeded)
            return AuthResult<UserInfo>.Fail(AuthError.Validation, created.Errors.Select(e => e.Description).ToArray());

        await _users.AddToRoleAsync(user, request.Role.ToString());
        return AuthResult<UserInfo>.Ok(new UserInfo(user.Id, email, name, request.Role, churchId));
    }

    private async Task RevokeAllAsync(Guid userId, DateTime now, CancellationToken ct)
    {
        var active = await _db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct);
        foreach (var t in active) t.Revoke(now);
    }

    private async Task<(AuthTokens Tokens, string RefreshHash)> IssueAsync(ApplicationUser user, CancellationToken ct)
    {
        var roles = await _users.GetRolesAsync(user);
        var role = roles.Select(r => Enum.TryParse<UserRole>(r, out var parsed) ? parsed : (UserRole?)null)
                        .FirstOrDefault(r => r is not null);
        if (role is null)
            throw new InvalidOperationException("User has no valid role.");

        var info = new UserInfo(user.Id, user.Email!, user.FullName, role.Value, user.ChurchId);
        var now = Now;
        var access = _tokens.CreateAccessToken(info, now);
        var refresh = _tokens.CreateRefreshToken(now);
        _db.RefreshTokens.Add(new RefreshToken(user.Id, refresh.Hash, refresh.ExpiresAt));
        return (new AuthTokens(access.Token, access.ExpiresAt, refresh.Raw, refresh.ExpiresAt, info), refresh.Hash);
    }
}
