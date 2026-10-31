using ChurchSeeker.Application.Announcements;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ChurchSeeker.WebAPI.Controllers;

[Route("api/announcements")]
[Authorize]
public class AnnouncementsController : ApiControllerBase
{
    private readonly IAnnouncementService _announcements;

    public AnnouncementsController(IAnnouncementService announcements) => _announcements = announcements;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        Map(await _announcements.ListAsync(includeInactive, page, pageSize, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Map(await _announcements.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Create(AnnouncementRequest request, CancellationToken ct) =>
        Map(await _announcements.CreateAsync(request, ct), a => CreatedAtAction(nameof(Get), new { id = a.Id }, a));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Update(Guid id, AnnouncementRequest request, CancellationToken ct) =>
        Map(await _announcements.UpdateAsync(id, request, ct));

    // Deactivates the announcement (soft delete); it disappears from every list unless includeInactive is set.
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct) =>
        Map(await _announcements.DeleteAsync(id, ct), _ => NoContent());
}

[Route("api/public/churches/{churchId:guid}")]
[AllowAnonymous]
[EnableRateLimiting(RateLimitPolicies.Public)]
public class PublicAnnouncementsController : ApiControllerBase
{
    private readonly IPublicAnnouncementService _announcements;

    public PublicAnnouncementsController(IPublicAnnouncementService announcements) => _announcements = announcements;

    [HttpGet("announcements")]
    public async Task<IActionResult> List(Guid churchId, [FromQuery] bool importantOnly = false, CancellationToken ct = default) =>
        Map(await _announcements.ListAsync(churchId, importantOnly, ct));

    // Important notices plus the next public events, for the church landing view.
    [HttpGet("highlights")]
    public async Task<IActionResult> Highlights(Guid churchId, CancellationToken ct) =>
        Map(await _announcements.HighlightsAsync(churchId, ct));
}
