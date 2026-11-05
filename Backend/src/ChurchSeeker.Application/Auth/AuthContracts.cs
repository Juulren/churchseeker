using ChurchSeeker.Domain.Enums;

namespace ChurchSeeker.Application.Auth;

public record LoginRequest(string Email, string Password);
public record RegisterUserRequest(string Email, string FullName, string Password, UserRole Role);
public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Email, string Token, string NewPassword);
public record SwitchChurchRequest(Guid ChurchId);

/// <summary>A church the user may work in.</summary>
public record ChurchRef(Guid Id, string Name);

/// <summary>ChurchId is the ACTIVE church (the one the token works in); Churches is every church the user may switch to.</summary>
public record UserInfo(Guid Id, string Email, string FullName, UserRole Role, Guid ChurchId, IReadOnlyList<ChurchRef>? Churches = null);

public record AuthTokens(
    string AccessToken,
    DateTime AccessExpiresAt,
    string RefreshToken,
    DateTime RefreshExpiresAt,
    UserInfo User);

public enum AuthError { None, InvalidCredentials, InvalidToken, Forbidden, Validation, NotFound, Conflict }

public sealed record AuthResult<T>(T? Value, AuthError Error, IReadOnlyList<string> Messages)
{
    public bool Succeeded => Error == AuthError.None;
    public static AuthResult<T> Ok(T value) => new(value, AuthError.None, []);
    public static AuthResult<T> Fail(AuthError error, params string[] messages) => new(default, error, messages);
}
