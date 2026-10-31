using ChurchSeeker.Application.Members;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

// Member contact data is sensitive: Administrador, Pastor and Secretario only.
[Route("api/members")]
[Authorize(Policy = Policies.Management)]
public class MembersController : ApiControllerBase
{
    private readonly IMemberService _members;

    public MembersController(IMemberService members) => _members = members;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] bool? active,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        Map(await _members.ListAsync(new MemberQuery(search, active, page, pageSize), ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Map(await _members.GetAsync(id, ct));

    [HttpPost]
    public async Task<IActionResult> Create(MemberRequest request, CancellationToken ct) =>
        Map(await _members.CreateAsync(request, ct),
            m => CreatedAtAction(nameof(Get), new { id = m.Id }, m));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, MemberRequest request, CancellationToken ct) =>
        Map(await _members.UpdateAsync(id, request, ct));

    // DELETE deactivates (soft delete). Rows are never physically removed.
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken ct) =>
        Map(await _members.SetActiveAsync(id, false, ct), _ => NoContent());

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id, CancellationToken ct) =>
        Map(await _members.SetActiveAsync(id, true, ct));
}
