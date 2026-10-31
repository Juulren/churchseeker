using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Enums;

namespace ChurchSeeker.WebAPI.Security;

public sealed class HttpCurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;

    public HttpCurrentUser(IHttpContextAccessor accessor) => _accessor = accessor;

    private System.Security.Claims.ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;
    public Guid? UserId => ParseGuid("sub");
    public Guid? ChurchId => ParseGuid("church_id");
    public UserRole? Role =>
        Enum.TryParse<UserRole>(Principal?.FindFirst("role")?.Value, out var r) && Enum.IsDefined(r) ? r : null;

    private Guid? ParseGuid(string claim) =>
        Guid.TryParse(Principal?.FindFirst(claim)?.Value, out var g) && g != Guid.Empty ? g : null;
}
