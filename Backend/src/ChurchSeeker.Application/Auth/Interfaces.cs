using ChurchSeeker.Domain.Enums;

namespace ChurchSeeker.Application.Auth;

public interface IAuthService
{
    Task<AuthResult<AuthTokens>> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<AuthResult<AuthTokens>> RefreshAsync(string? refreshToken, CancellationToken ct = default);
    Task LogoutAsync(string? refreshToken, CancellationToken ct = default);
    Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct = default);
    Task<AuthResult<bool>> ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default);
    Task<AuthResult<UserInfo>> RegisterUserAsync(RegisterUserRequest request, CancellationToken ct = default);
}

public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid? UserId { get; }
    Guid? ChurchId { get; }
    UserRole? Role { get; }
    string? IpAddress { get; }
}

public interface IEmailSender
{
    Task SendPasswordResetAsync(string email, string resetToken, CancellationToken ct = default);
}

