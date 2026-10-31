using ChurchSeeker.Application.Auth;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

public record AuthResponse(string AccessToken, DateTime ExpiresAt, UserInfo User);

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private const string RefreshCookie = "cs_refresh";
    private readonly IAuthService _auth;
    private readonly ICurrentUser _current;

    public AuthController(IAuthService auth, ICurrentUser current)
    {
        _auth = auth;
        _current = current;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct) =>
        ToResponse(await _auth.LoginAsync(request, ct));

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh(CancellationToken ct) =>
        ToResponse(await _auth.RefreshAsync(Request.Cookies[RefreshCookie], ct));

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await _auth.LogoutAsync(Request.Cookies[RefreshCookie], ct);
        Response.Cookies.Delete(RefreshCookie, CookieOptions(null));
        return NoContent();
    }

    // Always 204: the response never reveals whether the email exists.
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        await _auth.ForgotPasswordAsync(request, ct);
        return NoContent();
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct) =>
        Map(await _auth.ResetPasswordAsync(request, ct), _ => NoContent());

    [HttpPost("users")]
    [Authorize(Policy = Policies.AdminOnly)]
    public async Task<IActionResult> RegisterUser(RegisterUserRequest request, CancellationToken ct) =>
        Map(await _auth.RegisterUserAsync(request, ct), u => StatusCode(StatusCodes.Status201Created, u));

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me() => Ok(new { _current.UserId, _current.ChurchId, Role = _current.Role?.ToString() });

    private IActionResult ToResponse(AuthResult<AuthTokens> result) =>
        Map(result, t =>
        {
            Response.Cookies.Append(RefreshCookie, t.RefreshToken, CookieOptions(t.RefreshExpiresAt));
            return Ok(new AuthResponse(t.AccessToken, t.AccessExpiresAt, t.User));
        });

    private IActionResult Map<T>(AuthResult<T> result, Func<T, IActionResult> ok) => result.Error switch
    {
        AuthError.None => ok(result.Value!),
        AuthError.InvalidCredentials => Problem("Invalid credentials.", statusCode: StatusCodes.Status401Unauthorized),
        AuthError.InvalidToken => Problem("Invalid or expired token.", statusCode: StatusCodes.Status401Unauthorized),
        AuthError.Forbidden => Problem("Forbidden.", statusCode: StatusCodes.Status403Forbidden),
        _ => BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["errors"] = result.Messages.ToArray() }))
    };

    // Path-scoped so the browser only sends the refresh cookie to the auth endpoints.
    private static CookieOptions CookieOptions(DateTime? expires) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/api/auth",
        Expires = expires.HasValue ? new DateTimeOffset(DateTime.SpecifyKind(expires.Value, DateTimeKind.Utc)) : null
    };
}
