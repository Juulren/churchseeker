using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

// Staff administration: Administrador only, always limited to the caller's own church.
[Route("api/staff")]
[Authorize(Policy = Policies.AdminOnly)]
public class StaffController : ApiControllerBase
{
    private readonly IUserAdminService _staff;

    public StaffController(IUserAdminService staff) => _staff = staff;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = true, CancellationToken ct = default) =>
        Map(Adapt(await _staff.ListAsync(includeInactive, ct)));

    [HttpPut("{id:guid}/role")]
    public async Task<IActionResult> SetRole(Guid id, ChangeRoleRequest request, CancellationToken ct) =>
        Map(Adapt(await _staff.SetRoleAsync(id, request.Role, ct)));

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken ct) => Map(Adapt(await _staff.SetActiveAsync(id, false, ct)));

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id, CancellationToken ct) => Map(Adapt(await _staff.SetActiveAsync(id, true, ct)));

    [HttpPost("{id:guid}/send-reset")]
    public async Task<IActionResult> SendReset(Guid id, CancellationToken ct) => Map(Adapt(await _staff.SendPasswordResetAsync(id, ct)), _ => NoContent());

    private static Result<T> Adapt<T>(AuthResult<T> r) => r.Error switch
    {
        AuthError.None => Result<T>.Ok(r.Value!),
        AuthError.NotFound => Result<T>.Fail(ErrorKind.NotFound),
        AuthError.Conflict => Result<T>.Fail(ErrorKind.Conflict, r.Messages.ToArray()),
        AuthError.Forbidden => Result<T>.Fail(ErrorKind.Forbidden, r.Messages.ToArray()),
        _ => Result<T>.Fail(ErrorKind.Validation, r.Messages.ToArray())
    };
}
