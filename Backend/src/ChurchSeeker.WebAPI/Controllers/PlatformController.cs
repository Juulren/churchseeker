using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Platform;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

// The platform account only (also checked again inside the service): the general dashboard and who works in which church.
[ApiController]
[Route("api/platform")]
[Authorize(Policy = Policies.PlatformOnly)]
public class PlatformController : ControllerBase
{
    private readonly IPlatformService _platform;

    public PlatformController(IPlatformService platform) => _platform = platform;

    [HttpGet("overview")]
    public async Task<IActionResult> Overview(CancellationToken ct) => Map(await _platform.OverviewAsync(ct), Ok);

    [HttpGet("staff")]
    public async Task<IActionResult> Staff(CancellationToken ct) => Map(await _platform.ListStaffAsync(ct), Ok);

    [HttpPut("staff/{id:guid}/churches")]
    public async Task<IActionResult> SetChurches(Guid id, SetChurchesRequest request, CancellationToken ct) =>
        Map(await _platform.SetChurchesAsync(id, request.ChurchIds, ct), Ok);

    [HttpPost("staff")]
    public async Task<IActionResult> CreateStaff(CreatePlatformStaffRequest request, CancellationToken ct) =>
        Map(await _platform.CreateStaffAsync(request, ct), s => StatusCode(StatusCodes.Status201Created, s));

    [HttpPost("staff/{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken ct) => Map(await _platform.SetActiveAsync(id, false, ct), Ok);

    [HttpPost("staff/{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id, CancellationToken ct) => Map(await _platform.SetActiveAsync(id, true, ct), Ok);

    [HttpPut("staff/{id:guid}/role")]
    public async Task<IActionResult> SetRole(Guid id, ChangeRoleRequest request, CancellationToken ct) => Map(await _platform.SetRoleAsync(id, request.Role, ct), Ok);

    private IActionResult Map<T>(AuthResult<T> result, Func<T, IActionResult> ok) => result.Error switch
    {
        AuthError.None => ok(result.Value!),
        AuthError.Forbidden => Problem("Forbidden.", statusCode: StatusCodes.Status403Forbidden),
        AuthError.NotFound => NotFound(),
        AuthError.Conflict => Problem(string.Join(" ", result.Messages), statusCode: StatusCodes.Status409Conflict),
        _ => BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["errors"] = result.Messages.ToArray() }))
    };
}
