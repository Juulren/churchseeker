using ChurchSeeker.Application.Events;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ChurchSeeker.WebAPI.Controllers;

// Internal calendar: any signed-in staff may read, only Management may change.
[Route("api/events")]
[Authorize]
public class EventsController : ApiControllerBase
{
    private readonly IEventService _events;

    public EventsController(IEventService events) => _events = events;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default) =>
        Map(await _events.ListAsync(new EventQuery(from, to, page, pageSize), ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Map(await _events.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Create(EventRequest request, CancellationToken ct) =>
        Map(await _events.CreateAsync(request, ct), e => CreatedAtAction(nameof(Get), new { id = e.Id }, e));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Update(Guid id, EventRequest request, CancellationToken ct) =>
        Map(await _events.UpdateAsync(id, request, ct));

    // Events are cancelled, never deleted.
    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct) => Map(await _events.SetCancelledAsync(id, true, ct));

    [HttpPost("{id:guid}/restore")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Restore(Guid id, CancellationToken ct) => Map(await _events.SetCancelledAsync(id, false, ct));
}

[Route("api/public/churches/{churchId:guid}/events")]
[AllowAnonymous]
[EnableRateLimiting(RateLimitPolicies.Public)]
public class PublicEventsController : ApiControllerBase
{
    private readonly IPublicEventService _events;

    public PublicEventsController(IPublicEventService events) => _events = events;

    [HttpGet]
    public async Task<IActionResult> List(Guid churchId, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct) =>
        Map(await _events.ListAsync(churchId, from, to, ct));
}
