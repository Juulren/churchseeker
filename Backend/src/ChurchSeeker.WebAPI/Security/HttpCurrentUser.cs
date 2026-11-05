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
    private UserRole? Claimed =>
        Enum.TryParse<UserRole>(Principal?.FindFirst("role")?.Value, out var r) && Enum.IsDefined(r) ? r : null;

    public bool IsSuper => Claimed == UserRole.SuperAdministrador;

    // One place decides what the platform can do inside a church: everything an Administrador can.
    public UserRole? Role => Claimed == UserRole.SuperAdministrador ? UserRole.Administrador : Claimed;

    public string? IpAddress => _accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();

    private Guid? ParseGuid(string claim) =>
        Guid.TryParse(Principal?.FindFirst(claim)?.Value, out var g) && g != Guid.Empty ? g : null;
}

