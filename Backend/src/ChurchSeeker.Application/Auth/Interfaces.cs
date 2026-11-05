using ChurchSeeker.Domain.Enums;

namespace ChurchSeeker.Application.Auth;

public interface IAuthService
{
    Task<AuthResult<AuthTokens>> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<AuthResult<AuthTokens>> RefreshAsync(string? refreshToken, CancellationToken ct = default);
    Task LogoutAsync(string? refreshToken, CancellationToken ct = default);
    Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct = default);
    Task<AuthResult<bool>> ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default);
    // Moves the session to another church the user may use, and rotates the refresh token that remembers it.
    Task<AuthResult<AuthTokens>> SwitchChurchAsync(string? refreshToken, Guid churchId, CancellationToken ct = default);
    Task<AuthResult<UserInfo>> RegisterUserAsync(RegisterUserRequest request, CancellationToken ct = default);
    // Active staff of the caller's own church, optionally of one role (e.g. to pick a ministry coordinator).
    Task<AuthResult<IReadOnlyList<UserInfo>>> ListUsersAsync(UserRole? role, CancellationToken ct = default);
}

public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid? UserId { get; }
    Guid? ChurchId { get; }
    /// <summary>The role to authorise with: the platform acts as an Administrador inside the active church.</summary>
    UserRole? Role { get; }
    bool IsSuper { get; }
    string? IpAddress { get; }
}

public interface IEmailSender
{
    Task SendPasswordResetAsync(string email, string resetToken, CancellationToken ct = default);
}

