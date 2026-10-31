using ChurchSeeker.Application.Ministries;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

// Reads: Management plus the Coordinador of the ministry. The service hides other ministries from coordinators.
[Route("api/ministries")]
[Authorize(Policy = Policies.MinistryAccess)]
public class MinistriesController : ApiControllerBase
{
    private readonly IMinistryService _ministries;

    public MinistriesController(IMinistryService ministries) => _ministries = ministries;

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Map(await _ministries.ListAsync(ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Map(await _ministries.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Create(MinistryRequest request, CancellationToken ct) =>
        Map(await _ministries.CreateAsync(request, ct), m => CreatedAtAction(nameof(Get), new { id = m.Id }, m));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Update(Guid id, MinistryRequest request, CancellationToken ct) =>
        Map(await _ministries.UpdateAsync(id, request, ct));

    [HttpPost("{id:guid}/deactivate")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken ct) => Map(await _ministries.SetActiveAsync(id, false, ct));

    [HttpPost("{id:guid}/activate")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Activate(Guid id, CancellationToken ct) => Map(await _ministries.SetActiveAsync(id, true, ct));

    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> Members(Guid id, CancellationToken ct) => Map(await _ministries.MembersAsync(id, ct));

    [HttpPut("{id:guid}/members/{memberId:guid}")]
    public async Task<IActionResult> AddMember(Guid id, Guid memberId, CancellationToken ct) =>
        Map(await _ministries.AddMemberAsync(id, memberId, ct));

    [HttpDelete("{id:guid}/members/{memberId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberId, CancellationToken ct) =>
        Map(await _ministries.RemoveMemberAsync(id, memberId, ct));

    [HttpGet("{id:guid}/events")]
    public async Task<IActionResult> Events(Guid id, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct) =>
        Map(await _ministries.EventsAsync(id, from, to, ct));
}
